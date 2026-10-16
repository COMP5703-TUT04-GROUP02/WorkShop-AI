"""Admin booking lookup: exact AND filters, read-only complete dossier, role isolation."""

from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event

from backend import models
from backend.core.clock import utc_now
from tests.test_low_value_reviews import completed_booking


@pytest.fixture
def lookup_rows(db_session, marketplace):
    customer_id = marketplace["customer"]["user"]["id"]
    provider_id = marketplace["provider_profile"]["id"]
    other = models.User(name="Other customer", email="lookup-other@example.test", role="customer")
    provider_user = models.User(
        name="Other provider", email="lookup-provider@example.test", role="provider"
    )
    db_session.add_all([other, provider_user])
    db_session.flush()
    profile = models.ProviderProfile(
        user_id=provider_user.id,
        business_name="Other provider",
        bio="Test",
        service_province="Istanbul",
        tags="plumbing",
        certificate_name="Test",
        certificate_url="/test.png",
        hourly_rate=1,
    )
    db_session.add(profile)
    db_session.flush()
    rows = [
        completed_booking(db_session, customer_id, provider_id, "500"),
        completed_booking(db_session, customer_id, profile.id, "600"),
        completed_booking(db_session, other.id, provider_id, "700"),
        completed_booking(db_session, customer_id, provider_id, "800"),
    ]
    stamp = utc_now()
    for row, status in zip(rows, ["pending", "cancelled", "refunding", "completed"]):
        row.booking_at = stamp  # Equal timestamps exercise deterministic ID tie-breaks.
        row.status = status
    db_session.commit()
    return rows


def read(client, marketplace, path="/admin/bookings", **params):
    response = client.get(path, params=params, headers=marketplace["admin"]["headers"])
    assert response.status_code == 200, response.text
    assert response.json()["success"] is True
    return response.json()["data"]


def test_admin_groups_partition_workflow_statuses():
    from backend.schemas import BookingStatus
    from backend.utils.admin_booking import ADMIN_BOOKING_STATUS_GROUPS

    statuses = [status for values in ADMIN_BOOKING_STATUS_GROUPS.values() for status in values]
    assert len(ADMIN_BOOKING_STATUS_GROUPS) == 6
    assert len(statuses) == len(set(statuses)) == 22
    assert set(statuses) == {status.value for status in BookingStatus}


def test_group_filters_cover_all_states_before_pagination_and_keep_raw_detail(
    client, db_session, marketplace
):
    from backend.schemas import BookingStatus
    from backend.utils.admin_booking import ADMIN_BOOKING_STATUS_GROUPS

    customer_id = marketplace["customer"]["user"]["id"]
    provider_id = marketplace["provider_profile"]["id"]
    rows = {}
    stamp = utc_now()
    for status in BookingStatus:
        row = completed_booking(db_session, customer_id, provider_id, "100")
        row.status = status.value
        row.booking_at = stamp
        rows[status.value] = row
    db_session.commit()
    for group, members in ADMIN_BOOKING_STATUS_GROUPS.items():
        pages = [
            read(client, marketplace, status_group=group.value, page_size=1, page=page)
            for page in range(1, len(members) + 1)
        ]
        assert all(page["total"] == page["total_pages"] == len(members) for page in pages)
        assert [page["items"][0]["id"] for page in pages] == sorted(
            [rows[s].id for s in members], reverse=True
        )
        assert {page["items"][0]["status"] for page in pages} == set(members)
    target = rows["quoted"]
    assert (
        read(
            client,
            marketplace,
            status_group="pending",
            booking_id=target.id,
            customer_id=customer_id,
            provider_profile_id=provider_id,
        )["total"]
        == 1
    )
    assert read(client, marketplace, status_group="completed", booking_id=target.id)["total"] == 0
    assert (
        read(client, marketplace, status_group="pending", customer_id=customer_id + 999)["total"]
        == 0
    )
    # The pre-existing exact-status parameter still works, and combines via AND.
    assert read(client, marketplace, status_group="pending", status="quoted")["total"] == 1
    assert read(client, marketplace, status_group="pending", status="completed")["total"] == 0
    assert read(client, marketplace, f"/admin/bookings/{target.id}")["status"] == "quoted"
    db_session.expire_all()
    assert {row.status for row in db_session.query(models.Booking).all()} == {
        s.value for s in BookingStatus
    }
    assert (
        client.get(
            "/admin/bookings",
            params={"status_group": "not-valid"},
            headers=marketplace["admin"]["headers"],
        ).status_code
        == 422
    )


def test_lookup_exact_and_filters_before_pagination(client, db_session, marketplace, lookup_rows):
    a, b, c, d = lookup_rows
    all_rows = read(client, marketplace)
    assert [row["id"] for row in all_rows["items"]] == [d.id, c.id, b.id, a.id]
    for params, ids in [
        ({"customer_id": a.customer_id}, [d.id, b.id, a.id]),
        ({"provider_profile_id": a.provider_profile_id}, [d.id, c.id, a.id]),
        ({"booking_id": a.id}, [a.id]),
        (
            {"customer_id": a.customer_id, "provider_profile_id": a.provider_profile_id},
            [d.id, a.id],
        ),
        ({"booking_id": a.id, "customer_id": c.customer_id}, []),
        ({"booking_id": a.id, "provider_profile_id": b.provider_profile_id}, []),
        ({"booking_id": 999999}, []),
        ({"status": "cancelled"}, [b.id]),
    ]:
        result = read(client, marketplace, **params)
        assert [row["id"] for row in result["items"]] == ids
        assert result["total"] == len(ids)
    params = {
        "customer_id": a.customer_id,
        "provider_profile_id": a.provider_profile_id,
        "page_size": 1,
    }
    first, second = [read(client, marketplace, page=page, **params) for page in [1, 2]]
    assert first["total"] == second["total"] == first["total_pages"] == 2
    assert [first["items"][0]["id"], second["items"][0]["id"]] == [d.id, a.id]
    assert read(client, marketplace, **params, page=3)["items"] == []


@pytest.mark.parametrize("field", ["booking_id", "customer_id", "provider_profile_id"])
@pytest.mark.parametrize("value", ["0", "-1", "1.5", "abc"])
def test_invalid_lookup_ids_rejected(client, marketplace, field, value):
    response = client.get(
        "/admin/bookings", params={field: value}, headers=marketplace["admin"]["headers"]
    )
    assert response.status_code == 422


@pytest.mark.parametrize("path", ["/admin/bookings", "/admin/bookings/1"])
def test_admin_lookup_requires_admin(client, marketplace, path):
    assert client.get(path).status_code == 401
    for role in ["customer", "provider"]:
        assert client.get(path, headers=marketplace[role]["headers"]).status_code == 403


def test_missing_booking_and_empty_related_records(client, marketplace, lookup_rows):
    response = client.get("/admin/bookings/999999", headers=marketplace["admin"]["headers"])
    assert response.status_code == 404
    data = read(client, marketplace, f"/admin/bookings/{lookup_rows[0].id}")
    for key in [
        "status_history",
        "quote_revisions",
        "payments",
        "refund_requests",
        "complaints",
        "reviews",
        "attachments",
    ]:
        assert data[key] == []


def test_complete_dossier_is_read_only_scoped_and_excludes_secrets(
    client, db_session, marketplace, lookup_rows
):
    booking, unrelated = lookup_rows[:2]
    stamp = utc_now()
    booking.expected_service_amount = Decimal("450")
    booking.visit_fee_amount = Decimal("50")
    booking.quote_amount = Decimal("500")
    booking.quote_message = "Initial quote"
    booking.final_quote_amount = Decimal("525")
    booking.final_quote_message = "Final quote"
    booking.final_quote_decline_reason = "Customer reason"
    booking.status_note = "Admin note"
    booking.onboarding_paused = True
    booking.onboarding_pause_reason = "provider_unavailable"
    booking.onboarding_paused_at = stamp
    db_session.add_all(
        [
            models.BookingStatusHistory(
                booking_id=booking.id,
                changed_by_user_id=booking.customer_id,
                old_status="pending",
                new_status="quoted",
                note="First",
                changed_at=stamp,
            ),
            models.BookingStatusHistory(
                booking_id=booking.id,
                changed_by_user_id=booking.customer_id,
                old_status="quoted",
                new_status="pending",
                note="Second",
                changed_at=stamp,
            ),
            models.BookingStatusHistory(
                booking_id=unrelated.id,
                changed_by_user_id=booking.customer_id,
                old_status="pending",
                new_status="cancelled",
                note="UNRELATED",
                changed_at=stamp,
            ),
        ]
    )
    for number in [1, 2]:
        revision = models.BookingQuoteRevision(
            booking_id=booking.id,
            revision_number=number,
            quote_amount=100 * number,
            quote_message=f"Quote {number}",
            created_by_user_id=booking.customer_id,
            declined_at=stamp if number == 1 else None,
            decline_reason="Too much" if number == 1 else None,
        )
        db_session.add(revision)
        db_session.flush()
        db_session.add(
            models.BookingAttachment(
                booking_id=booking.id,
                uploaded_by_user_id=booking.customer_id,
                quote_revision_id=revision.id,
                purpose="quote_attachment",
                original_file_name=f"quote-{number}.png",
                file_name=f"q{number}.png",
                file_url=f"/uploads/q{number}.png",
                content_type="image/png",
                size=123,
            )
        )
    payment = models.Payment(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        provider_profile_id=booking.provider_profile_id,
        amount=Decimal("50"),
        currency="TRY",
        status="paid",
        payment_stage="visit_fee",
        iyzico_token="SECRET-CHECKOUT-TOKEN",
        checkout_url="https://secret-checkout.test",
        frontend_return_url="https://secret-return.test",
        idempotency_key="SECRET-REQUEST-KEY",
    )
    db_session.add(payment)
    db_session.flush()
    db_session.add(
        models.PaymentSettlement(
            payment_id=payment.id,
            booking_id=booking.id,
            provider_profile_id=booking.provider_profile_id,
            platform_commission_rate=Decimal("0.10"),
            platform_commission_amount=Decimal("5"),
            provider_share_amount=Decimal("45"),
            status="approval_failed",
            failure_message="Sample failure",
        )
    )
    db_session.add(
        models.Payment(
            booking_id=booking.id,
            customer_id=booking.customer_id,
            provider_profile_id=booking.provider_profile_id,
            amount=Decimal("450"),
            currency="TRY",
            status="failed",
            payment_stage="service_fee",
            created_at=stamp + timedelta(seconds=1),
            failure_message="Sample declined payment",
        )
    )
    db_session.add_all(
        [
            models.RefundRequest(
                booking_id=booking.id,
                payment_id=payment.id,
                customer_id=booking.customer_id,
                provider_profile_id=booking.provider_profile_id,
                reason="Partial refund",
                status="appealed",
                previous_booking_status="pending",
                refund_amount=Decimal("12"),
            ),
            models.Complaint(
                booking_id=booking.id,
                customer_id=booking.customer_id,
                reason="Complaint",
                status="open",
            ),
            models.Review(
                booking_id=booking.id,
                customer_id=booking.customer_id,
                provider_profile_id=booking.provider_profile_id,
                rating=4,
                comment="Hidden review",
                is_visible=0,
            ),
        ]
    )
    db_session.commit()

    statements = []

    def record_sql(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split()[0].upper())

    event.listen(db_session.bind, "before_cursor_execute", record_sql)
    try:
        data = read(client, marketplace, f"/admin/bookings/{booking.id}")
    finally:
        event.remove(db_session.bind, "before_cursor_execute", record_sql)
    assert not {"INSERT", "UPDATE", "DELETE"}.intersection(statements)
    assert data["id"] == booking.id
    assert set(models.Booking.__table__.columns.keys()) <= set(data)
    assert data["onboarding_paused"] is True
    assert data["onboarding_pause_reason"] == "provider_unavailable"
    assert data["customer"]["id"] == booking.customer_id
    assert data["provider"]["id"] == booking.provider_profile_id
    assert [row["note"] for row in data["status_history"]] == ["First", "Second"]
    assert [row["revision_number"] for row in data["quote_revisions"]] == [1, 2]
    assert len(data["attachments"]) == 2  # Keep historical as well as current quote attachments.
    assert data["payments"][0]["payment_stage"] == "visit_fee"
    assert data["payments"][0]["settlement"]["failure_message"] == "Sample failure"
    assert data["payments"][1]["payment_stage"] == "service_fee"
    assert data["payments"][1]["failure_message"] == "Sample declined payment"
    assert data["payments"][1]["settlement"] is None
    assert data["refund_requests"][0]["refund_amount"] == 12
    assert data["complaint_summary"]["open_complaint_count"] == 1
    assert data["complaints"][0]["reason"] == "Complaint"
    assert data["reviews"][0]["is_visible"] == 0
    serialized = str(data)
    assert (
        "SECRET" not in serialized
        and "secret-checkout" not in serialized
        and "secret-return" not in serialized
    )
    assert "UNRELATED" not in serialized
    for key in [
        "iyzico_token",
        "checkout_url",
        "frontend_return_url",
        "idempotency_key",
        "password",
        "password_hash",
    ]:
        assert key not in serialized

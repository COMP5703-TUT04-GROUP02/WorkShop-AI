"""Draft integration keeps query scopes and existing single-record mutations."""

from decimal import Decimal

import pytest

from backend import models
from tests.test_low_value_reviews import completed_booking, review_for


def get_data(client, marketplace, path, **params):
    response = client.get(path, params=params, headers=marketplace["admin"]["headers"])
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_portfolio_provider_filter_precedes_pagination(client, db_session, marketplace):
    provider_id = marketplace["provider_profile"]["id"]
    rows = []
    for status in ("pending", "pending", "approved"):
        row = models.ProviderPortfolio(
            provider_profile_id=provider_id,
            title=status,
            image_url="/test.png",
            verification_status=status,
        )
        db_session.add(row)
        rows.append(row)
    db_session.commit()
    params = dict(provider_profile_id=provider_id, verification_status="pending", page_size=1)
    first = get_data(client, marketplace, "/admin/provider-portfolios", **params)
    second = get_data(client, marketplace, "/admin/provider-portfolios", **params, page=2)
    assert first["total"] == second["total"] == 2
    assert first["total_pages"] == 2
    assert [first["items"][0]["id"], second["items"][0]["id"]] == [rows[1].id, rows[0].id]
    assert (
        get_data(
            client, marketplace, "/admin/provider-portfolios", provider_profile_id=provider_id + 999
        )["total"]
        == 0
    )


@pytest.mark.parametrize("status", ["draft", "active", "rejected", "update_failed"])
def test_payout_status_and_provider_filters_and_masking(client, db_session, marketplace, status):
    record = db_session.query(models.ProviderSubmerchant).one()
    record.status = status
    db_session.commit()
    params = dict(status=status, provider_profile_id=record.provider_profile_id)
    data = get_data(client, marketplace, "/admin/submerchants", **params)
    assert data["total"] == 1
    assert data["items"][0]["status"] == status
    assert data["items"][0]["iban"] != record.iban
    assert data["items"][0]["identity_number"] != record.identity_number
    assert (
        get_data(
            client,
            marketplace,
            "/admin/submerchants",
            provider_profile_id=record.provider_profile_id + 999,
            status=status,
        )["total"]
        == 0
    )
    other_status = "active" if status != "active" else "draft"
    assert get_data(client, marketplace, "/admin/submerchants", status=other_status)["total"] == 0
    assert get_data(client, marketplace, "/admin/submerchants")["total"] == 1


def seed_refunds(db, marketplace):
    customer = marketplace["customer"]["user"]["id"]
    provider = marketplace["provider_profile"]["id"]
    rows = []
    for status in ("appealed", "appealed", "rejected"):
        booking = completed_booking(db, customer, provider, "500")
        payment = models.Payment(
            booking_id=booking.id,
            customer_id=customer,
            provider_profile_id=provider,
            amount=Decimal("500"),
            status="paid",
        )
        db.add(payment)
        db.flush()
        refund = models.RefundRequest(
            booking_id=booking.id,
            payment_id=payment.id,
            customer_id=customer,
            provider_profile_id=provider,
            reason="Test request",
            appeal_reason="Test appeal",
            status=status,
            previous_booking_status="completed",
            refund_amount=Decimal("120"),
        )
        db.add(refund)
        db.commit()
        rows.append(refund)
    return rows


def test_payout_accounts_have_real_twenty_row_pages(client, db_session, marketplace):
    from backend.core.clock import utc_now

    timestamp = utc_now()
    ids = []
    for index in range(21):
        user = models.User(
            name=f"Page Provider {index}", email=f"page{index}@example.com", role="provider"
        )
        db_session.add(user)
        db_session.flush()
        profile = models.ProviderProfile(
            user_id=user.id,
            business_name="Page sample",
            bio="Test",
            service_province="Istanbul",
            tags="plumbing",
            certificate_name="Test",
            certificate_url="/test.png",
            hourly_rate=1,
        )
        db_session.add(profile)
        db_session.flush()
        account = models.ProviderSubmerchant(
            provider_profile_id=profile.id,
            submerchant_type="PERSONAL",
            submerchant_external_id=f"page-{index}",
            email=user.email,
            gsm_number="+905551110000",
            address="Test",
            status="draft",
            updated_at=timestamp,
        )
        db_session.add(account)
        db_session.flush()
        ids.append(account.id)
    db_session.commit()
    first = get_data(client, marketplace, "/admin/submerchants", status="draft")
    second = get_data(client, marketplace, "/admin/submerchants", status="draft", page=2)
    assert first["total"] == second["total"] == 21
    assert first["total_pages"] == 2
    assert len(first["items"]) == 20 and len(second["items"]) == 1
    assert [item["id"] for item in first["items"] + second["items"]] == list(reversed(ids))


def test_refund_search_ands_all_ids_and_preserves_appeal_queue(client, db_session, marketplace):
    rows = seed_refunds(db_session, marketplace)
    target = rows[0]
    params = dict(
        status="appealed",
        customer_id=target.customer_id,
        provider_profile_id=target.provider_profile_id,
    )
    for key in ("customer_id", "provider_profile_id"):
        data = get_data(
            client, marketplace, "/admin/refund-requests", status="appealed", **{key: params[key]}
        )
        assert data["total"] == 2
    first = get_data(client, marketplace, "/admin/refund-requests", **params, page_size=1)
    second = get_data(client, marketplace, "/admin/refund-requests", **params, page_size=1, page=2)
    assert first["total"] == second["total"] == 2
    assert first["items"][0]["id"] == rows[1].id
    assert second["items"][0]["id"] == target.id
    assert second["items"][0]["refund_amount"] == 120
    exact = get_data(
        client, marketplace, "/admin/refund-requests", **params, refund_request_id=target.id
    )
    assert exact["total"] == 1
    for key in ("customer_id", "provider_profile_id"):
        invalid = {**params, key: params[key] + 999, "refund_request_id": target.id}
        assert get_data(client, marketplace, "/admin/refund-requests", **invalid)["total"] == 0
    assert (
        get_data(
            client, marketplace, "/admin/refund-requests", **params, refund_request_id=rows[2].id
        )["total"]
        == 0
    )


@pytest.mark.parametrize(
    "path,key",
    [
        ("/admin/provider-portfolios", "provider_profile_id"),
        ("/admin/submerchants", "provider_profile_id"),
        ("/admin/refund-requests", "refund_request_id"),
        ("/admin/refund-requests", "customer_id"),
        ("/admin/refund-requests", "provider_profile_id"),
    ],
)
def test_exact_ids_validate_and_require_admin(client, marketplace, path, key):
    headers = marketplace["admin"]["headers"]
    for value in ("0", "-1", "1.2", "abc"):
        assert client.get(path, params={key: value}, headers=headers).status_code == 422
    assert client.get(path).status_code == 401
    assert client.get(path, headers=marketplace["provider"]["headers"]).status_code == 403
    assert client.get(path, headers=marketplace["customer"]["headers"]).status_code == 403


def test_invalid_payout_status_rejected(client, marketplace):
    assert (
        client.get(
            "/admin/submerchants",
            params={"status": "unknown"},
            headers=marketplace["admin"]["headers"],
        ).status_code
        == 422
    )


def test_selected_review_visibility_leaves_unselected_and_preserves_rating(
    client, db_session, marketplace, monkeypatch
):
    deleted, synced = [], []
    monkeypatch.setattr(
        "backend.routers.admin.enqueue_review_embedding_delete",
        lambda review, db, user_id=None: deleted.append(review.id),
    )
    monkeypatch.setattr(
        "backend.routers.admin.enqueue_review_embedding_sync",
        lambda review, db, user_id=None: synced.append(review.id),
    )
    customer = marketplace["customer"]["user"]["id"]
    provider = marketplace["provider_profile"]["id"]
    selected = review_for(
        db_session, completed_booking(db_session, customer, provider, "5"), rating=1
    )
    untouched = review_for(
        db_session, completed_booking(db_session, customer, provider, "6"), rating=5
    )
    headers = marketplace["admin"]["headers"]
    endpoint = f"/admin/reviews/{selected.id}/visibility"
    assert client.put(endpoint, json={"is_visible": False}, headers=headers).status_code == 200
    db_session.refresh(selected)
    db_session.refresh(untouched)
    assert selected.is_visible == 0 and untouched.is_visible == 1
    public = client.get(f"/providers/{provider}").json()["data"]
    assert public["review_count"] == 1 and public["average_rating"] == 5
    assert client.put(endpoint, json={"is_visible": True}, headers=headers).status_code == 200
    public = client.get(f"/providers/{provider}").json()["data"]
    assert public["review_count"] == 2 and public["average_rating"] == 3
    assert deleted == [selected.id] and synced == [selected.id]

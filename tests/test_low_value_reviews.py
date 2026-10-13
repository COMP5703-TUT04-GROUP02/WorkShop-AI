"""Hiding reviews that were bought with a token-priced booking."""

from datetime import timedelta
from decimal import Decimal

from backend import models
from backend.core.clock import utc_now


def completed_booking(db_session, customer_id, provider_profile_id, total_amount):
    completed_at = utc_now() - timedelta(days=1)
    booking = models.Booking(
        customer_id=customer_id,
        provider_profile_id=provider_profile_id,
        title="Deep clean",
        service_description="Two bedroom deep clean",
        service_address="Sultanahmet, Istanbul",
        service_latitude=41.0082,
        service_longitude=28.9784,
        booking_at=completed_at - timedelta(days=1),
        scheduled_start_time=completed_at - timedelta(hours=2),
        scheduled_end_time=completed_at,
        completed_at=completed_at,
        total_amount=Decimal(total_amount),
        status="completed",
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)
    return booking


def review_for(db_session, booking, rating=5, comment="Great work", is_visible=1):
    review = models.Review(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        provider_profile_id=booking.provider_profile_id,
        rating=rating,
        comment=comment,
        created_at=utc_now(),
        is_visible=is_visible,
    )
    db_session.add(review)
    db_session.commit()
    db_session.refresh(review)
    return review


def seed_three(db_session, marketplace):
    """One token-priced review, one borderline, one genuine."""
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    cheap = review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "5.00"),
        rating=5,
        comment="Best service ever",
    )
    borderline = review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "100.00"),
        rating=5,
        comment="Quick and tidy",
    )
    genuine = review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "850.00"),
        rating=4,
        comment="Arrived on time and the price held",
    )
    return cheap, borderline, genuine


def test_the_sweep_lists_only_cheap_visible_reviews(client, db_session, marketplace):
    cheap, borderline, genuine = seed_three(db_session, marketplace)

    response = client.get(
        "/admin/reviews/low-value", headers=marketplace["admin"]["headers"]
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]

    assert data["threshold"] == 100.0
    assert [item["id"] for item in data["items"]] == [cheap.id]
    # The booking that paid for it is on the row, so the admin can see why.
    assert data["items"][0]["booking_total_amount"] == 5.0
    assert data["items"][0]["provider_business_name"]
    assert borderline.id not in [item["id"] for item in data["items"]]
    assert genuine.id not in [item["id"] for item in data["items"]]


def test_the_threshold_is_exclusive(client, db_session, marketplace):
    """A booking exactly on the threshold is not cheap enough to hide."""
    _cheap, borderline, _genuine = seed_three(db_session, marketplace)

    response = client.get(
        "/admin/reviews/low-value",
        params={"threshold": 100},
        headers=marketplace["admin"]["headers"],
    )
    assert borderline.id not in [item["id"] for item in response.json()["data"]["items"]]

    response = client.get(
        "/admin/reviews/low-value",
        params={"threshold": 100.01},
        headers=marketplace["admin"]["headers"],
    )
    assert borderline.id in [item["id"] for item in response.json()["data"]["items"]]


def test_already_hidden_reviews_are_left_alone(client, db_session, marketplace):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    hidden = review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "4.00"),
        is_visible=0,
    )

    response = client.get(
        "/admin/reviews/low-value", headers=marketplace["admin"]["headers"]
    )
    assert [item["id"] for item in response.json()["data"]["items"]] == []
    assert response.json()["data"]["total"] == 0
    db_session.refresh(hidden)
    assert hidden.is_visible == 0


def test_cheapest_first(client, db_session, marketplace):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    for amount in ("60.00", "3.00", "25.00"):
        review_for(
            db_session, completed_booking(db_session, customer_id, profile_id, amount)
        )

    response = client.get(
        "/admin/reviews/low-value", headers=marketplace["admin"]["headers"]
    )
    amounts = [item["booking_total_amount"] for item in response.json()["data"]["items"]]
    assert amounts == [3.0, 25.0, 60.0]


def test_hiding_removes_them_from_the_public_profile_and_the_rating(
    client, db_session, marketplace
):
    cheap, borderline, genuine = seed_three(db_session, marketplace)
    profile_id = marketplace["provider_profile"]["id"]

    before = client.get(f"/providers/{profile_id}/reviews")
    assert sorted(item["id"] for item in before.json()["data"]["items"]) == sorted(
        [cheap.id, borderline.id, genuine.id]
    )

    response = client.post(
        "/admin/reviews/low-value/hide",
        json={"threshold": 100},
        headers=marketplace["admin"]["headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["hidden"] == 1
    assert response.json()["data"]["review_ids"] == [cheap.id]

    db_session.refresh(cheap)
    db_session.refresh(borderline)
    assert cheap.is_visible == 0
    assert borderline.is_visible == 1

    after = client.get(f"/providers/{profile_id}/reviews")
    assert cheap.id not in [item["id"] for item in after.json()["data"]["items"]]

    # The inflated five star no longer counts towards the public rating.
    detail = client.get(f"/providers/{profile_id}")
    assert detail.json()["data"]["review_count"] == 2
    assert detail.json()["data"]["average_rating"] == 4.5


def test_running_the_sweep_twice_hides_nothing_the_second_time(
    client, db_session, marketplace
):
    seed_three(db_session, marketplace)
    headers = marketplace["admin"]["headers"]

    first = client.post(
        "/admin/reviews/low-value/hide", json={"threshold": 100}, headers=headers
    )
    second = client.post(
        "/admin/reviews/low-value/hide", json={"threshold": 100}, headers=headers
    )

    assert first.json()["data"]["hidden"] == 1
    assert second.json()["data"]["hidden"] == 0


def test_a_hidden_review_can_be_put_back(client, db_session, marketplace):
    """The existing visibility control is the undo for a wrong sweep."""
    cheap, _borderline, _genuine = seed_three(db_session, marketplace)
    headers = marketplace["admin"]["headers"]

    client.post("/admin/reviews/low-value/hide", json={"threshold": 100}, headers=headers)
    restored = client.put(
        f"/admin/reviews/{cheap.id}/visibility",
        json={"is_visible": True},
        headers=headers,
    )

    assert restored.status_code == 200, restored.text
    db_session.refresh(cheap)
    assert cheap.is_visible == 1


def test_the_threshold_has_to_be_a_positive_amount(client, db_session, marketplace):
    headers = marketplace["admin"]["headers"]

    assert (
        client.get(
            "/admin/reviews/low-value", params={"threshold": 0}, headers=headers
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/admin/reviews/low-value/hide", json={"threshold": -5}, headers=headers
        ).status_code
        == 422
    )


def test_only_an_admin_can_run_the_sweep(client, db_session, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]

    assert client.get("/admin/reviews/low-value", headers=customer).status_code == 403
    assert (
        client.post(
            "/admin/reviews/low-value/hide", json={"threshold": 100}, headers=provider
        ).status_code
        == 403
    )


def test_a_brand_new_provider_with_no_cheap_reviews_sees_an_empty_sweep(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    review_for(
        db_session, completed_booking(db_session, customer_id, profile_id, "500.00")
    )

    response = client.get(
        "/admin/reviews/low-value", headers=marketplace["admin"]["headers"]
    )
    assert response.json()["data"]["total"] == 0
    assert response.json()["data"]["items"] == []


# --- the mirror: putting wrongly hidden reviews back -------------------------


def test_the_restore_sweep_lists_only_hidden_expensive_reviews(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    hidden_expensive = review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "800.00"),
        is_visible=0,
    )
    hidden_cheap = review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "5.00"),
        is_visible=0,
    )
    visible_expensive = review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "900.00"),
        is_visible=1,
    )

    response = client.get(
        "/admin/reviews/high-value-hidden", headers=marketplace["admin"]["headers"]
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]

    assert data["threshold"] == 100.0
    ids = [item["id"] for item in data["items"]]
    assert ids == [hidden_expensive.id]
    assert hidden_cheap.id not in ids
    assert visible_expensive.id not in ids
    assert data["items"][0]["booking_total_amount"] == 800.0


def test_the_restore_threshold_is_inclusive(client, db_session, marketplace):
    """A booking exactly on the threshold is expensive enough to come back."""
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    on_threshold = review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "100.00"),
        is_visible=0,
    )

    response = client.get(
        "/admin/reviews/high-value-hidden",
        params={"threshold": 100},
        headers=marketplace["admin"]["headers"],
    )
    assert [item["id"] for item in response.json()["data"]["items"]] == [on_threshold.id]


def test_restore_lists_the_dearest_first(client, db_session, marketplace):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    for amount in ("300.00", "900.00", "500.00"):
        review_for(
            db_session,
            completed_booking(db_session, customer_id, profile_id, amount),
            is_visible=0,
        )

    response = client.get(
        "/admin/reviews/high-value-hidden", headers=marketplace["admin"]["headers"]
    )
    amounts = [item["booking_total_amount"] for item in response.json()["data"]["items"]]
    assert amounts == [900.0, 500.0, 300.0]


def test_showing_puts_them_back_on_the_profile_and_into_the_rating(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    restored = review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "800.00"),
        rating=2,
        comment="Late and left a mess",
        is_visible=0,
    )
    review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "900.00"),
        rating=4,
        comment="Solid work",
        is_visible=1,
    )

    before = client.get(f"/providers/{profile_id}")
    assert before.json()["data"]["review_count"] == 1
    assert before.json()["data"]["average_rating"] == 4.0

    response = client.post(
        "/admin/reviews/high-value-hidden/show",
        json={"threshold": 100},
        headers=marketplace["admin"]["headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["restored"] == 1
    assert response.json()["data"]["review_ids"] == [restored.id]

    db_session.refresh(restored)
    assert restored.is_visible == 1

    after = client.get(f"/providers/{profile_id}")
    assert after.json()["data"]["review_count"] == 2
    assert after.json()["data"]["average_rating"] == 3.0
    public = client.get(f"/providers/{profile_id}/reviews")
    assert restored.id in [item["id"] for item in public.json()["data"]["items"]]


def test_hiding_then_restoring_returns_to_the_starting_state(
    client, db_session, marketplace
):
    """A sweep run at too high an amount is undone by the mirror sweep."""
    cheap, borderline, genuine = seed_three(db_session, marketplace)
    headers = marketplace["admin"]["headers"]
    profile_id = marketplace["provider_profile"]["id"]
    before = client.get(f"/providers/{profile_id}").json()["data"]

    # Swept far too aggressively: everything under 1000 TRY goes.
    hidden = client.post(
        "/admin/reviews/low-value/hide", json={"threshold": 1000}, headers=headers
    )
    assert hidden.json()["data"]["hidden"] == 3

    # Bring back everything that sat on a properly priced job.
    restored = client.post(
        "/admin/reviews/high-value-hidden/show",
        json={"threshold": 100},
        headers=headers,
    )
    assert sorted(restored.json()["data"]["review_ids"]) == sorted(
        [borderline.id, genuine.id]
    )

    db_session.refresh(cheap)
    db_session.refresh(borderline)
    db_session.refresh(genuine)
    # The token-priced one stays hidden; the real ones are back.
    assert cheap.is_visible == 0
    assert borderline.is_visible == 1
    assert genuine.is_visible == 1

    after = client.get(f"/providers/{profile_id}").json()["data"]
    assert after["review_count"] == before["review_count"] - 1


def test_running_the_restore_twice_changes_nothing_the_second_time(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    review_for(
        db_session,
        completed_booking(db_session, customer_id, profile_id, "800.00"),
        is_visible=0,
    )
    headers = marketplace["admin"]["headers"]

    first = client.post(
        "/admin/reviews/high-value-hidden/show", json={"threshold": 100}, headers=headers
    )
    second = client.post(
        "/admin/reviews/high-value-hidden/show", json={"threshold": 100}, headers=headers
    )

    assert first.json()["data"]["restored"] == 1
    assert second.json()["data"]["restored"] == 0


def test_only_an_admin_can_run_the_restore(client, db_session, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]

    assert (
        client.get("/admin/reviews/high-value-hidden", headers=customer).status_code
        == 403
    )
    assert (
        client.post(
            "/admin/reviews/high-value-hidden/show",
            json={"threshold": 100},
            headers=provider,
        ).status_code
        == 403
    )

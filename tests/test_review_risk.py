"""Fake review detection: the scoring rules and the admin moderation queue."""

from datetime import timedelta
from decimal import Decimal

from backend import models
from backend.core.clock import utc_now
from backend.utils.review_risk import (
    evaluate_review_risk,
    normalize_comment,
    upsert_review_risk_assessment,
)
from tests.conftest import register_session


def age_account(db_session, user_id, days):
    """Push a user's sign-up date back so account age stops being a signal."""
    user = db_session.query(models.User).filter(models.User.id == user_id).first()
    user.created_at = utc_now() - timedelta(days=days)
    db_session.commit()


def make_completed_booking(
    db_session,
    customer_id,
    provider_profile_id,
    completed_at=None,
    total_amount="800.00",
):
    completed_at = completed_at or utc_now() - timedelta(days=1)
    booking = models.Booking(
        customer_id=customer_id,
        provider_profile_id=provider_profile_id,
        title="Kitchen tap replacement",
        service_description="Replace the kitchen mixer tap",
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


def make_review(db_session, booking, rating=5, comment="Great work", created_at=None):
    review = models.Review(
        booking_id=booking.id,
        customer_id=booking.customer_id,
        provider_profile_id=booking.provider_profile_id,
        rating=rating,
        comment=comment,
        created_at=created_at or utc_now(),
        is_visible=1,
    )
    db_session.add(review)
    db_session.commit()
    db_session.refresh(review)
    return review


def signal_codes(result):
    return {signal["code"] for signal in result["signals"]}


def test_normalize_comment_ignores_punctuation_and_case():
    assert normalize_comment("Best service EVER!!!") == normalize_comment(
        "best service, ever"
    )


def test_a_genuine_review_stays_low_risk(client, db_session, marketplace):
    """A regular customer leaving a normal review must not be flagged."""
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    age_account(db_session, customer_id, days=120)

    # An earlier job, far enough back that it is not a repeat-booking burst.
    make_completed_booking(
        db_session,
        customer_id,
        profile_id,
        completed_at=utc_now() - timedelta(days=40),
    )
    booking = make_completed_booking(
        db_session, customer_id, profile_id, completed_at=utc_now() - timedelta(days=2)
    )
    review = make_review(
        db_session,
        booking,
        rating=4,
        comment="Arrived on time, explained the problem and cleaned up afterwards.",
        created_at=utc_now() - timedelta(days=1),
    )

    result = evaluate_review_risk(review, db_session)

    assert result["signals"] == []
    assert result["score"] == 0
    assert result["level"] == "low"


def test_duplicate_wording_on_the_same_provider_is_detected(
    client, db_session, marketplace
):
    profile_id = marketplace["provider_profile"]["id"]
    first_customer = marketplace["customer"]["user"]["id"]
    second = register_session(client, "second@example.com", role="customer")
    second_customer = second["user"]["id"]
    age_account(db_session, first_customer, days=120)
    age_account(db_session, second_customer, days=120)

    first_booking = make_completed_booking(db_session, first_customer, profile_id)
    make_review(
        db_session,
        first_booking,
        rating=5,
        comment="Absolutely perfect job, fixed everything in one visit!",
    )

    second_booking = make_completed_booking(db_session, second_customer, profile_id)
    copied = make_review(
        db_session,
        second_booking,
        rating=5,
        comment="absolutely perfect job fixed everything in one visit",
    )

    result = evaluate_review_risk(copied, db_session)

    assert "duplicate_comment" in signal_codes(result)
    assert result["score"] >= 30
    assert result["level"] in {"medium", "high"}


def test_brand_new_account_with_a_throwaway_five_star_is_flagged(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    # The account was created by the fixture moments ago, so it stays new here.
    booking = make_completed_booking(
        db_session, customer_id, profile_id, completed_at=utc_now()
    )
    review = make_review(db_session, booking, rating=5, comment="Great")

    result = evaluate_review_risk(review, db_session)
    codes = signal_codes(result)

    assert "new_reviewer_account" in codes
    assert "reviewer_first_and_only_booking" in codes
    assert "instant_review" in codes
    assert "extreme_rating_short_comment" in codes
    assert result["score"] == 50
    assert result["level"] == "medium"


def test_a_burst_of_reviews_for_one_provider_is_flagged(
    client, db_session, marketplace
):
    profile_id = marketplace["provider_profile"]["id"]
    customer_id = marketplace["customer"]["user"]["id"]
    age_account(db_session, customer_id, days=120)

    for index in range(3):
        booking = make_completed_booking(
            db_session,
            customer_id,
            profile_id,
            completed_at=utc_now() - timedelta(days=30 + index),
        )
        latest = make_review(
            db_session,
            booking,
            rating=5,
            comment=f"Solid work on job number {index}, would hire again.",
            created_at=utc_now() - timedelta(hours=2 - index),
        )

    result = evaluate_review_risk(latest, db_session)

    assert "provider_review_burst" in signal_codes(result)


def test_an_unusually_cheap_booking_is_flagged(client, db_session, marketplace):
    profile_id = marketplace["provider_profile"]["id"]
    customer_id = marketplace["customer"]["user"]["id"]
    age_account(db_session, customer_id, days=120)

    for index in range(5):
        make_completed_booking(
            db_session,
            customer_id,
            profile_id,
            completed_at=utc_now() - timedelta(days=60 + index),
            total_amount="1000.00",
        )

    cheap = make_completed_booking(
        db_session,
        customer_id,
        profile_id,
        completed_at=utc_now() - timedelta(days=20),
        total_amount="50.00",
    )
    review = make_review(
        db_session,
        cheap,
        rating=5,
        comment="Very nice service, thank you so much for the help.",
        created_at=utc_now() - timedelta(days=19),
    )

    result = evaluate_review_risk(review, db_session)

    assert "low_value_booking" in signal_codes(result)


def test_review_posted_through_the_api_is_scored_and_queued(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    booking = make_completed_booking(
        db_session, customer_id, profile_id, completed_at=utc_now()
    )

    response = client.post(
        f"/bookings/{booking.id}/review",
        json={"rating": 5, "comment": "Great"},
        headers=marketplace["customer"]["headers"],
    )
    assert response.status_code == 200, response.text
    # The score is never handed back to the reviewer.
    assert "risk" not in response.json()["data"]

    review_id = response.json()["data"]["review"]["id"]
    assessment = (
        db_session.query(models.ReviewRiskAssessment)
        .filter(models.ReviewRiskAssessment.review_id == review_id)
        .first()
    )
    assert assessment is not None
    assert assessment.level == "medium"
    assert assessment.status == "pending"

    queue = client.get(
        "/admin/reviews/risk", headers=marketplace["admin"]["headers"]
    )
    assert queue.status_code == 200, queue.text
    items = queue.json()["data"]["items"]
    assert [item["risk"]["review_id"] for item in items] == [review_id]
    assert items[0]["provider_business_name"]
    assert any(
        signal["label"] == "Extreme rating, no substance"
        for signal in items[0]["risk"]["signals"]
    )


def test_admin_confirming_a_fake_review_hides_it(client, db_session, marketplace):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    booking = make_completed_booking(
        db_session, customer_id, profile_id, completed_at=utc_now()
    )
    review = make_review(db_session, booking, rating=5, comment="Great")
    upsert_review_risk_assessment(review, db_session)

    response = client.put(
        f"/admin/reviews/{review.id}/risk/decision",
        json={"status": "confirmed_fake", "note": "Account created to post this"},
        headers=marketplace["admin"]["headers"],
    )
    assert response.status_code == 200, response.text
    assert (
        response.json()["data"]["flagged_review"]["risk"]["status"] == "confirmed_fake"
    )

    db_session.refresh(review)
    assert review.is_visible == 0

    public = client.get(f"/providers/{profile_id}/reviews")
    assert public.status_code == 200, public.text
    assert public.json()["data"]["items"] == []


def test_admin_dismissing_a_flag_keeps_the_review_visible(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    booking = make_completed_booking(
        db_session, customer_id, profile_id, completed_at=utc_now()
    )
    review = make_review(db_session, booking, rating=5, comment="Great")
    upsert_review_risk_assessment(review, db_session)

    response = client.put(
        f"/admin/reviews/{review.id}/risk/decision",
        json={"status": "dismissed", "note": "Checked the booking, it is genuine"},
        headers=marketplace["admin"]["headers"],
    )
    assert response.status_code == 200, response.text

    db_session.refresh(review)
    assert review.is_visible == 1

    pending = client.get(
        "/admin/reviews/risk",
        params={"status": "pending"},
        headers=marketplace["admin"]["headers"],
    )
    assert pending.json()["data"]["items"] == []


def test_a_decision_cannot_set_the_status_back_to_pending(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    booking = make_completed_booking(db_session, customer_id, profile_id)
    review = make_review(db_session, booking, rating=5, comment="Great")
    upsert_review_risk_assessment(review, db_session)

    response = client.put(
        f"/admin/reviews/{review.id}/risk/decision",
        json={"status": "pending"},
        headers=marketplace["admin"]["headers"],
    )
    assert response.status_code == 422, response.text


def test_provider_reports_a_review_and_it_reaches_the_admin_queue(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    age_account(db_session, customer_id, days=120)
    make_completed_booking(
        db_session, customer_id, profile_id, completed_at=utc_now() - timedelta(days=40)
    )
    booking = make_completed_booking(
        db_session, customer_id, profile_id, completed_at=utc_now() - timedelta(days=2)
    )
    review = make_review(
        db_session,
        booking,
        rating=1,
        comment="This provider never showed up, total waste of an afternoon.",
        created_at=utc_now() - timedelta(days=1),
    )

    response = client.post(
        f"/provider/reviews/{review.id}/report",
        json={"reason": "We have arrival photos and a signed completion note"},
        headers=marketplace["provider"]["headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["reported_by_provider"] is True

    queue = client.get(
        "/admin/reviews/risk", headers=marketplace["admin"]["headers"]
    )
    items = queue.json()["data"]["items"]
    assert [item["risk"]["review_id"] for item in items] == [review.id]
    assert items[0]["risk"]["reported_by_provider"] is True
    assert "arrival photos" in items[0]["risk"]["provider_report_reason"]


def test_provider_cannot_report_the_same_review_twice(client, db_session, marketplace):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    booking = make_completed_booking(db_session, customer_id, profile_id)
    review = make_review(db_session, booking, rating=1, comment="Terrible, never again")

    first = client.post(
        f"/provider/reviews/{review.id}/report",
        json={"reason": "The customer cancelled before we arrived"},
        headers=marketplace["provider"]["headers"],
    )
    assert first.status_code == 200, first.text

    second = client.post(
        f"/provider/reviews/{review.id}/report",
        json={"reason": "Reporting again"},
        headers=marketplace["provider"]["headers"],
    )
    assert second.status_code == 400, second.text


def test_provider_cannot_report_a_review_on_another_profile(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    booking = make_completed_booking(
        db_session, customer_id, marketplace["provider_profile"]["id"]
    )
    review = make_review(db_session, booking, rating=1, comment="Terrible, never again")

    other = register_session(client, "other-provider@example.com", role="provider")
    other_profile = models.ProviderProfile(
        user_id=other["user"]["id"],
        business_name="Other Trades",
        bio="Other trades services",
        service_province="Istanbul",
        tags="cleaning",
        certificate_name="Trade licence",
        certificate_url="/uploads/other-trades.pdf",
        hourly_rate=300,
    )
    db_session.add(other_profile)
    db_session.commit()

    response = client.post(
        f"/provider/reviews/{review.id}/report",
        json={"reason": "Not my review"},
        headers=other["headers"],
    )
    assert response.status_code == 404, response.text


def test_rescan_rescores_reviews_created_before_the_rules_existed(
    client, db_session, marketplace
):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    booking = make_completed_booking(
        db_session, customer_id, profile_id, completed_at=utc_now()
    )
    # Written straight to the table, as the reviews that predate this feature are.
    review = make_review(db_session, booking, rating=5, comment="Great")
    assert (
        db_session.query(models.ReviewRiskAssessment)
        .filter(models.ReviewRiskAssessment.review_id == review.id)
        .first()
        is None
    )

    response = client.post(
        "/admin/reviews/risk/rescan", headers=marketplace["admin"]["headers"]
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["scanned"] == 1
    assert response.json()["data"]["medium"] == 1

    assessment = (
        db_session.query(models.ReviewRiskAssessment)
        .filter(models.ReviewRiskAssessment.review_id == review.id)
        .first()
    )
    assert assessment.level == "medium"


def test_admin_stats_report_the_moderation_backlog(client, db_session, marketplace):
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    booking = make_completed_booking(
        db_session, customer_id, profile_id, completed_at=utc_now()
    )
    review = make_review(db_session, booking, rating=5, comment="Great")
    upsert_review_risk_assessment(review, db_session)

    response = client.get(
        "/admin/dashboard", headers=marketplace["admin"]["headers"]
    )
    assert response.status_code == 200, response.text
    reviews = response.json()["data"]["reviews"]
    assert reviews["flagged_medium"] == 1
    assert reviews["awaiting_decision"] == 1
    assert reviews["confirmed_fake"] == 0


def test_a_review_dated_before_the_account_existed_is_not_a_new_account(
    client, db_session, marketplace
):
    """Imported or seeded rows predate their own user and must not look new."""
    customer_id = marketplace["customer"]["user"]["id"]
    profile_id = marketplace["provider_profile"]["id"]
    booking = make_completed_booking(
        db_session,
        customer_id,
        profile_id,
        completed_at=utc_now() - timedelta(days=200),
    )
    review = make_review(
        db_session,
        booking,
        rating=4,
        comment="Turned up when they said they would and the price held.",
        created_at=utc_now() - timedelta(days=199),
    )

    result = evaluate_review_risk(review, db_session)

    assert "new_reviewer_account" not in signal_codes(result)


def test_short_common_praise_does_not_count_as_duplicate_wording(
    client, db_session, marketplace
):
    profile_id = marketplace["provider_profile"]["id"]
    first_customer = marketplace["customer"]["user"]["id"]
    second = register_session(client, "third@example.com", role="customer")
    age_account(db_session, first_customer, days=120)
    age_account(db_session, second["user"]["id"], days=120)

    first_booking = make_completed_booking(db_session, first_customer, profile_id)
    make_review(db_session, first_booking, rating=4, comment="Great service")

    second_booking = make_completed_booking(
        db_session, second["user"]["id"], profile_id
    )
    repeated = make_review(
        db_session, second_booking, rating=4, comment="great service!"
    )

    result = evaluate_review_risk(repeated, db_session)

    assert "duplicate_comment" not in signal_codes(result)

"""Fake review detection.

Every review is scored against explainable rules that only read data the
platform already records: how the wording compares with other reviews, the
reviewer's account age and booking history, how quickly the review arrived,
and how the booking's value compares with the provider's own history. The
result is stored in `review_risk_assessments` so admins work a short queue
instead of reading every review, and every score can be explained to the
provider it affects.
"""

import json
import re
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend import models
from backend.core.clock import parse_dt, utc_now
from backend.schemas import BookingStatus, ReviewRiskLevel, ReviewRiskStatus
from backend.utils.formatters import format_review_response, format_user_response

# A signal only ever adds to the score; no single signal can flag a review on
# its own except a provider report, which is a human accusation.
RISK_SIGNAL_WEIGHTS = {
    "duplicate_comment": 30,
    "provider_reported": 30,
    "provider_review_burst": 20,
    "repeat_pair_burst": 20,
    "new_reviewer_account": 15,
    "reviewer_first_and_only_booking": 15,
    "low_value_booking": 15,
    "instant_review": 10,
    "extreme_rating_short_comment": 10,
}

RISK_SIGNAL_LABELS = {
    "duplicate_comment": "Duplicate wording",
    "provider_reported": "Reported by the provider",
    "provider_review_burst": "Burst of reviews",
    "repeat_pair_burst": "Repeat bookings with the same provider",
    "new_reviewer_account": "Brand new reviewer account",
    "reviewer_first_and_only_booking": "Reviewer's only completed booking",
    "low_value_booking": "Unusually cheap booking",
    "instant_review": "Posted immediately after completion",
    "extreme_rating_short_comment": "Extreme rating, no substance",
}

HIGH_RISK_SCORE = 60
MEDIUM_RISK_SCORE = 30

NEW_ACCOUNT_DAYS = 3
INSTANT_REVIEW_MINUTES = 10
BURST_WINDOW_HOURS = 24
BURST_REVIEW_COUNT = 3
REPEAT_PAIR_WINDOW_DAYS = 7
REPEAT_PAIR_BOOKING_COUNT = 2
LOW_VALUE_RATIO = Decimal("0.3")
LOW_VALUE_MIN_HISTORY = 5
SHORT_COMMENT_LENGTH = 12
# Short praise like "great service" repeats honestly all the time, so only
# wording long enough to be someone's own sentence counts as a copy.
DUPLICATE_MIN_LENGTH = 25
DUPLICATE_SCAN_LIMIT = 200


def normalize_comment(value: str | None) -> str:
    """Strip punctuation and spacing so reworded copies still match."""
    if not value:
        return ""
    return re.sub(r"\W+", " ", value.lower()).strip()


def risk_level_for_score(score: int) -> str:
    if score >= HIGH_RISK_SCORE:
        return ReviewRiskLevel.high.value
    if score >= MEDIUM_RISK_SCORE:
        return ReviewRiskLevel.medium.value
    return ReviewRiskLevel.low.value


def _signal(code: str, detail: str) -> dict:
    return {"code": code, "weight": RISK_SIGNAL_WEIGHTS[code], "detail": detail}


def _find_duplicate_comment(review: models.Review, comment: str, db: Session):
    candidates = (
        db.query(models.Review)
        .filter(
            models.Review.id != review.id,
            models.Review.comment.isnot(None),
            or_(
                models.Review.provider_profile_id == review.provider_profile_id,
                models.Review.customer_id == review.customer_id,
            ),
        )
        .order_by(models.Review.created_at.desc())
        .limit(DUPLICATE_SCAN_LIMIT)
        .all()
    )

    for candidate in candidates:
        if normalize_comment(candidate.comment) == comment:
            return candidate

    return None


def _provider_median_booking_amount(
    provider_profile_id: int, exclude_booking_id: int, db: Session
):
    rows = (
        db.query(models.Booking.total_amount)
        .filter(
            models.Booking.provider_profile_id == provider_profile_id,
            models.Booking.status == BookingStatus.completed.value,
            models.Booking.id != exclude_booking_id,
            models.Booking.total_amount.isnot(None),
        )
        .all()
    )

    amounts = sorted(Decimal(str(row[0])) for row in rows)
    if len(amounts) < LOW_VALUE_MIN_HISTORY:
        return None

    middle = len(amounts) // 2
    if len(amounts) % 2 == 1:
        return amounts[middle]
    return (amounts[middle - 1] + amounts[middle]) / 2


def evaluate_review_risk(
    review: models.Review, db: Session, reported_by_provider: bool = False
):
    """Return the score, level and the signals that produced them."""
    signals = []
    created_at = parse_dt(review.created_at) or utc_now()
    comment = normalize_comment(review.comment)

    if len(comment) >= DUPLICATE_MIN_LENGTH:
        twin = _find_duplicate_comment(review, comment, db)
        if twin is not None:
            signals.append(
                _signal("duplicate_comment", f"Identical wording to review #{twin.id}")
            )

    reviewer = (
        db.query(models.User).filter(models.User.id == review.customer_id).first()
    )
    if reviewer is not None:
        joined_at = parse_dt(reviewer.created_at)
        if joined_at is not None and (
            timedelta(0) <= created_at - joined_at <= timedelta(days=NEW_ACCOUNT_DAYS)
        ):
            hours = max(int((created_at - joined_at).total_seconds() // 3600), 0)
            signals.append(
                _signal(
                    "new_reviewer_account",
                    f"Reviewer account was {hours} hours old when the review was posted",
                )
            )

    completed_bookings = (
        db.query(models.Booking)
        .filter(
            models.Booking.customer_id == review.customer_id,
            models.Booking.status == BookingStatus.completed.value,
        )
        .count()
    )
    if completed_bookings <= 1:
        signals.append(
            _signal(
                "reviewer_first_and_only_booking",
                "Reviewer has one completed booking in total",
            )
        )

    booking = (
        db.query(models.Booking).filter(models.Booking.id == review.booking_id).first()
    )

    if booking is not None:
        completed_at = parse_dt(booking.completed_at)
        if completed_at is not None:
            gap = created_at - completed_at
            if timedelta(0) <= gap <= timedelta(minutes=INSTANT_REVIEW_MINUTES):
                minutes = int(gap.total_seconds() // 60)
                signals.append(
                    _signal(
                        "instant_review",
                        f"Posted {minutes} minutes after the booking was completed",
                    )
                )

        pair_window_start = created_at - timedelta(days=REPEAT_PAIR_WINDOW_DAYS)
        pair_bookings = (
            db.query(models.Booking)
            .filter(
                models.Booking.customer_id == review.customer_id,
                models.Booking.provider_profile_id == review.provider_profile_id,
                models.Booking.status == BookingStatus.completed.value,
                models.Booking.completed_at >= pair_window_start,
            )
            .count()
        )
        if pair_bookings >= REPEAT_PAIR_BOOKING_COUNT:
            signals.append(
                _signal(
                    "repeat_pair_burst",
                    f"{pair_bookings} completed bookings with this provider "
                    f"in {REPEAT_PAIR_WINDOW_DAYS} days",
                )
            )

        if booking.total_amount is not None:
            median = _provider_median_booking_amount(
                review.provider_profile_id, booking.id, db
            )
            if median is not None and median > 0:
                amount = Decimal(str(booking.total_amount))
                if amount <= median * LOW_VALUE_RATIO:
                    signals.append(
                        _signal(
                            "low_value_booking",
                            f"Booking value {amount:.2f} is at or below 30% of this "
                            f"provider's median {median:.2f}",
                        )
                    )

    burst_window_start = created_at - timedelta(hours=BURST_WINDOW_HOURS)
    burst_reviews = (
        db.query(models.Review)
        .filter(
            models.Review.provider_profile_id == review.provider_profile_id,
            models.Review.created_at >= burst_window_start,
            models.Review.created_at <= created_at,
        )
        .count()
    )
    if burst_reviews >= BURST_REVIEW_COUNT:
        signals.append(
            _signal(
                "provider_review_burst",
                f"{burst_reviews} reviews for this provider within "
                f"{BURST_WINDOW_HOURS} hours",
            )
        )

    if review.rating in (1, 5) and len(comment) < SHORT_COMMENT_LENGTH:
        signals.append(
            _signal(
                "extreme_rating_short_comment",
                f"{review.rating}-star rating with a {len(comment)}-character comment",
            )
        )

    if reported_by_provider:
        signals.append(
            _signal("provider_reported", "The provider reported this review as fake")
        )

    score = min(sum(signal["weight"] for signal in signals), 100)

    return {"score": score, "level": risk_level_for_score(score), "signals": signals}


def upsert_review_risk_assessment(
    review: models.Review,
    db: Session,
    reported_by_provider: bool | None = None,
    report_reason: str | None = None,
):
    """Score a review and store the result, keeping any existing decision."""
    assessment = (
        db.query(models.ReviewRiskAssessment)
        .filter(models.ReviewRiskAssessment.review_id == review.id)
        .first()
    )

    reported = bool(assessment.reported_by_provider) if assessment else False
    if reported_by_provider is not None:
        reported = reported_by_provider

    result = evaluate_review_risk(review, db, reported_by_provider=reported)
    now = utc_now()

    if assessment is None:
        assessment = models.ReviewRiskAssessment(
            review_id=review.id,
            provider_profile_id=review.provider_profile_id,
            status=ReviewRiskStatus.pending.value,
            created_at=now,
        )
        db.add(assessment)

    assessment.provider_profile_id = review.provider_profile_id
    assessment.score = result["score"]
    assessment.level = result["level"]
    assessment.signals = json.dumps(result["signals"])
    assessment.evaluated_at = now
    assessment.reported_by_provider = 1 if reported else 0

    if reported_by_provider:
        assessment.provider_report_reason = report_reason
        assessment.provider_reported_at = now
        # A fresh accusation puts a previously dismissed review back in the queue.
        if assessment.status == ReviewRiskStatus.dismissed.value:
            assessment.status = ReviewRiskStatus.pending.value
            assessment.decided_by_user_id = None
            assessment.decided_at = None
            assessment.decision_note = None

    db.commit()
    db.refresh(assessment)

    return assessment


def get_review_risk_assessment(review_id: int, db: Session):
    return (
        db.query(models.ReviewRiskAssessment)
        .filter(models.ReviewRiskAssessment.review_id == review_id)
        .first()
    )


def read_risk_signals(assessment: models.ReviewRiskAssessment):
    """Stored signals, with their display label applied at read time."""
    try:
        stored = json.loads(assessment.signals or "[]")
    except ValueError:
        return []

    signals = []
    for signal in stored:
        code = signal.get("code", "")
        signals.append(
            {
                "code": code,
                "label": RISK_SIGNAL_LABELS.get(code, code),
                "weight": signal.get("weight", 0),
                "detail": signal.get("detail", ""),
            }
        )

    return signals


def format_review_risk_response(assessment: models.ReviewRiskAssessment):
    return {
        "id": assessment.id,
        "review_id": assessment.review_id,
        "provider_profile_id": assessment.provider_profile_id,
        "score": assessment.score,
        "level": assessment.level,
        "status": assessment.status,
        "signals": read_risk_signals(assessment),
        "reported_by_provider": bool(assessment.reported_by_provider),
        "provider_report_reason": assessment.provider_report_reason,
        "provider_reported_at": assessment.provider_reported_at,
        "decided_by_user_id": assessment.decided_by_user_id,
        "decided_at": assessment.decided_at,
        "decision_note": assessment.decision_note,
        "evaluated_at": assessment.evaluated_at,
        "created_at": assessment.created_at,
    }


def format_flagged_review_response(
    assessment: models.ReviewRiskAssessment, db: Session
):
    review = (
        db.query(models.Review)
        .filter(models.Review.id == assessment.review_id)
        .first()
    )
    profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == assessment.provider_profile_id)
        .first()
    )
    customer = (
        db.query(models.User).filter(models.User.id == review.customer_id).first()
        if review
        else None
    )

    return {
        "risk": format_review_risk_response(assessment),
        "review": {
            **format_review_response(review),
            "customer": format_user_response(customer) if customer else None,
        }
        if review
        else None,
        "provider_business_name": profile.business_name if profile else None,
    }

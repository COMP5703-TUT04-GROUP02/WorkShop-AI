from decimal import Decimal

from sqlalchemy.orm import Session

from backend import models
from backend.utils.formatters import format_review_response, format_user_response


def format_review_detail_response(review: models.Review, db: Session):
    result = format_review_response(review)

    customer = (
        db.query(models.User).filter(models.User.id == review.customer_id).first()
    )

    result["customer"] = format_user_response(customer) if customer else None

    return result


def get_provider_rating_summary(provider_id: int, db: Session):
    reviews = (
        db.query(models.Review)
        .filter(
            models.Review.provider_profile_id == provider_id,
            models.Review.is_visible == 1,
        )
        .all()
    )

    review_count = len(reviews)

    if review_count == 0:
        average_rating = None
    else:
        total_rating = 0

        for review in reviews:
            total_rating += review.rating

        average_rating = round(total_rating / review_count, 2)

    return {
        "average_rating": average_rating,
        "review_count": review_count,
    }


def build_low_value_review_query(threshold: Decimal, db: Session):
    """Visible reviews whose booking total is under the threshold, cheapest first.

    A booking priced far below what any provider charges cannot be a real job,
    so a review attached to one was almost certainly bought with a token order.
    """
    return (
        db.query(
            models.Review,
            models.Booking.total_amount,
            models.ProviderProfile.business_name,
        )
        .join(models.Booking, models.Booking.id == models.Review.booking_id)
        .join(
            models.ProviderProfile,
            models.ProviderProfile.id == models.Review.provider_profile_id,
        )
        .filter(
            models.Review.is_visible == 1,
            models.Booking.total_amount < threshold,
        )
        .order_by(models.Booking.total_amount.asc(), models.Review.id.asc())
    )


def format_low_value_review_response(
    review: models.Review,
    booking_total_amount,
    provider_business_name: str | None,
    db: Session,
):
    result = format_review_detail_response(review, db)
    result["booking_total_amount"] = (
        float(booking_total_amount) if booking_total_amount is not None else None
    )
    result["provider_business_name"] = provider_business_name

    return result

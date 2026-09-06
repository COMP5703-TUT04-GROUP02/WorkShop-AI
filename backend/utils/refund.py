from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend import models
from backend.schemas import BookingStatus
from backend.utils.booking import format_booking_detail_response
from backend.utils.payment import format_payment_response
from backend.core.clock import utc_now

REFUND_RESTORABLE_BOOKING_STATUSES = [
    BookingStatus.accepted,
    BookingStatus.awaiting_confirmation,
]


def ensure_refund_can_restore_previous_booking_status(
    refund_request: models.RefundRequest,
):
    if refund_request.previous_booking_status not in REFUND_RESTORABLE_BOOKING_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Refund request has an invalid previous booking status",
        )


def add_refund_request_status_history(
    refund_request: models.RefundRequest,
    old_status: str,
    new_status: str,
    note: str | None,
    current_user: models.User,
    db: Session,
):
    history = models.RefundRequestStatusHistory(
        refund_request_id=refund_request.id,
        changed_by_user_id=current_user.id,
        old_status=old_status,
        new_status=new_status,
        note=note,
        changed_at=utc_now(),
    )

    db.add(history)


def format_refund_request_response(
    refund_request: models.RefundRequest,
    db: Session,
):
    booking = (
        db.query(models.Booking)
        .filter(models.Booking.id == refund_request.booking_id)
        .first()
    )
    payment = (
        db.query(models.Payment)
        .filter(models.Payment.id == refund_request.payment_id)
        .first()
    )

    return {
        "id": refund_request.id,
        "booking_id": refund_request.booking_id,
        "payment_id": refund_request.payment_id,
        "customer_id": refund_request.customer_id,
        "provider_profile_id": refund_request.provider_profile_id,
        "service_stage": refund_request.service_stage,
        "reason": refund_request.reason,
        "status": refund_request.status,
        "provider_note": refund_request.provider_note,
        "appeal_reason": refund_request.appeal_reason,
        "admin_note": refund_request.admin_note,
        "previous_booking_status": refund_request.previous_booking_status,
        "created_at": refund_request.created_at,
        "responded_at": refund_request.responded_at,
        "appealed_at": refund_request.appealed_at,
        "admin_responded_at": refund_request.admin_responded_at,
        "cancelled_at": refund_request.cancelled_at,
        "refunded_at": refund_request.refunded_at,
        "booking": format_booking_detail_response(booking, db) if booking else None,
        "payment": format_payment_response(payment, db) if payment else None,
    }

from sqlalchemy.orm import Session

from backend import models
from backend.schemas import PaymentStatus
from backend.utils.booking import format_booking_detail_response


def fail_pending_payments_for_booking(booking: models.Booking, db: Session):
    pending_payments = (
        db.query(models.Payment)
        .filter(
            models.Payment.booking_id == booking.id,
            models.Payment.status == PaymentStatus.pending,
        )
        .all()
    )

    for payment in pending_payments:
        payment.status = PaymentStatus.failed

    return len(pending_payments)


def format_payment_response(payment: models.Payment, db: Session):
    booking = (
        db.query(models.Booking).filter(models.Booking.id == payment.booking_id).first()
    )

    return {
        "id": payment.id,
        "booking_id": payment.booking_id,
        "customer_id": payment.customer_id,
        "provider_profile_id": payment.provider_profile_id,
        "amount": payment.amount,
        "currency": payment.currency,
        "status": payment.status,
        "payment_method": payment.payment_method,
        "external_payment_id": payment.external_payment_id,
        "created_at": payment.created_at,
        "paid_at": payment.paid_at,
        "refunded_at": payment.refunded_at,
        "booking": format_booking_detail_response(booking, db) if booking else None,
    }

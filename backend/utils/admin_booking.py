"""Read-only Admin booking dossier. Explicit projections never expose checkout secrets.

Keep this separate from customer/provider serializers and state-transition helpers.
Chat-room contents and provider onboarding documents are not booking records.
"""

from enum import Enum

from sqlalchemy.orm import Session

from backend import models
from backend.utils.booking import format_booking_detail_response
from backend.utils.marketplace import format_payment_settlement


class AdminBookingGroup(str, Enum):
    pending = "pending"
    awaiting_payment = "awaiting_payment"
    in_progress = "in_progress"
    completed = "completed"
    refund_related = "refund_related"
    closed = "closed"


# Query categories only. Never rewrite the stored workflow status.
ADMIN_BOOKING_STATUS_GROUPS = {
    AdminBookingGroup.pending: ("pending", "quoted"),
    AdminBookingGroup.awaiting_payment: (
        "awaiting_payment",
        "awaiting_visit_payment",
        "awaiting_service_payment",
    ),
    AdminBookingGroup.in_progress: (
        "visit_paid",
        "provider_arrived",
        "awaiting_final_quote",
        "final_quote_sent",
        "service_paid",
        "accepted",
        "awaiting_confirmation",
    ),
    AdminBookingGroup.completed: ("completed",),
    AdminBookingGroup.refund_related: ("refunding", "refunded", "partially_refunded"),
    AdminBookingGroup.closed: (
        "rejected",
        "cancelled",
        "cancelled_before_visit",
        "provider_no_show",
        "visit_completed_closed",
        "service_cancelled_after_payment",
    ),
}


def _project(record, fields: str):
    return {name: getattr(record, name) for name in fields.split()}


def format_admin_booking_detail(booking: models.Booking, db: Session):
    result = format_booking_detail_response(booking, db)
    result.update(
        onboarding_paused=booking.onboarding_paused,
        onboarding_pause_reason=booking.onboarding_pause_reason,
        onboarding_paused_at=booking.onboarding_paused_at,
    )
    histories = (
        db.query(models.BookingStatusHistory)
        .filter(models.BookingStatusHistory.booking_id == booking.id)
        .order_by(
            models.BookingStatusHistory.changed_at.asc(), models.BookingStatusHistory.id.asc()
        )
        .all()
    )
    result["status_history"] = [
        _project(row, "id booking_id changed_by_user_id old_status new_status note changed_at")
        for row in histories
    ]
    revisions = (
        db.query(models.BookingQuoteRevision)
        .filter(models.BookingQuoteRevision.booking_id == booking.id)
        .order_by(
            models.BookingQuoteRevision.revision_number.asc(), models.BookingQuoteRevision.id.asc()
        )
        .all()
    )
    result["quote_revisions"] = [
        _project(
            row,
            "id booking_id revision_number quote_amount quote_message "
            "expected_service_amount visit_fee_amount total_amount created_by_user_id "
            "declined_at decline_reason customer_confirmed_at used_for_payment_at created_at",
        )
        for row in revisions
    ]
    payments = (
        db.query(models.Payment)
        .filter(models.Payment.booking_id == booking.id)
        .order_by(models.Payment.created_at.asc(), models.Payment.id.asc())
        .all()
    )
    settlements = {
        row.payment_id: row
        for row in db.query(models.PaymentSettlement)
        .filter(models.PaymentSettlement.booking_id == booking.id)
        .all()
    }
    result["payments"] = []
    for payment in payments:
        # Never return tokens, checkout/return URLs or request idempotency keys.
        item = _project(
            payment,
            "id booking_id customer_id provider_profile_id amount currency status payment_stage "
            "payment_method processing_started_at checkout_expires_at external_payment_id "
            "iyzico_payment_id payment_transaction_id external_status failure_code failure_message "
            "created_at paid_at authorized_at voided_at capture_failed_at refunded_at failed_at",
        )
        item["settlement"] = format_payment_settlement(settlements.get(payment.id))
        result["payments"].append(item)
    refunds = (
        db.query(models.RefundRequest)
        .filter(models.RefundRequest.booking_id == booking.id)
        .order_by(models.RefundRequest.created_at.asc(), models.RefundRequest.id.asc())
        .all()
    )
    result["refund_requests"] = [
        _project(
            row,
            "id booking_id payment_id customer_id provider_profile_id reason status "
            "provider_note appeal_reason admin_note previous_booking_status created_at "
            "responded_at appealed_at admin_responded_at cancelled_at refunded_at "
            "refund_amount external_refund_id failure_code failure_message",
        )
        for row in refunds
    ]
    complaints = (
        db.query(models.Complaint)
        .filter(models.Complaint.booking_id == booking.id)
        .order_by(models.Complaint.created_at.asc(), models.Complaint.id.asc())
        .all()
    )
    result["complaints"] = [
        _project(row, "id booking_id customer_id reason status admin_note created_at resolved_at")
        for row in complaints
    ]
    result["reviews"] = [
        _project(
            row,
            "id booking_id customer_id provider_profile_id rating comment is_visible created_at",
        )
        for row in db.query(models.Review).filter(models.Review.booking_id == booking.id).all()
    ]
    return result

"""Provider booking actions.

Provider state changes: quote, reject, complete, approve/reject refund.
All entries verify the provider owns the booking.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend import models
from backend.schemas import (
    BookingNoteUpdate,
    BookingStatus,
    NotificationRelatedType,
    NotificationType,
    PaymentStatus,
    ProviderBookingQuoteCreate,
    ProviderRefundRejectCreate,
    RefundRequestStatus,
)
from backend.utils.booking import (
    add_booking_status_history,
    ensure_booking_status,
    format_booking_detail_response,
    save_booking,
)
from backend.utils.chat import (
    create_booking_status_chat_message,
    push_chat_message_to_room_members,
)
from backend.utils.notification import create_notification
from backend.utils.payment import format_payment_response
from backend.utils.marketplace import require_active_provider_submerchant
from backend.utils.provider import get_provider_profile_for_user
from backend.utils.refund import (
    add_refund_request_status_history,
    format_refund_request_response,
)
from backend.utils.upload import delete_local_upload, save_booking_attachment_upload
from backend.core.clock import utc_now


async def approve_provider_refund_request_action(
    refund_request_id: int,
    current_user: models.User,
    db: Session,
):
    """Provider approves refund.

    Updates refund request, payment, and booking to approved/refunded.
    payment -> refunded, booking -> refunded.
    """

    provider_profile = get_provider_profile_for_user(current_user.id, db)
    refund_request = (
        db.query(models.RefundRequest)
        .filter(
            models.RefundRequest.id == refund_request_id,
            models.RefundRequest.provider_profile_id == provider_profile.id,
        )
        .first()
    )
    if not refund_request:
        raise HTTPException(status_code=404, detail="Refund request not found")
    if refund_request.status != RefundRequestStatus.pending:
        raise HTTPException(
            status_code=400, detail="Only pending refund requests can be approved"
        )

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == refund_request.booking_id,
            models.Booking.provider_profile_id == provider_profile.id,
        )
        .first()
    )
    payment = (
        db.query(models.Payment)
        .filter(
            models.Payment.id == refund_request.payment_id,
            models.Payment.booking_id == refund_request.booking_id,
            models.Payment.customer_id == refund_request.customer_id,
            models.Payment.provider_profile_id == provider_profile.id,
            models.Payment.status == PaymentStatus.paid,
        )
        .first()
    )
    if not booking or not payment:
        raise HTTPException(
            status_code=400,
            detail="Booking or paid payment not found for this refund request",
        )

    ensure_booking_status(
        booking, [BookingStatus.refunding], "Only refunding bookings can be refunded"
    )
    now = utc_now()
    old_status = booking.status
    old_refund_status = refund_request.status
    refund_request.status = RefundRequestStatus.approved
    refund_request.responded_at = now
    refund_request.refunded_at = now
    payment.status = PaymentStatus.refunded
    payment.refunded_at = now
    booking.status = BookingStatus.refunded
    booking.status_note = "Provider approved refund request"
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Provider approved the refund request",
        booking.status_note,
        db,
        {
            "refund_request_id": refund_request.id,
            "refund_status": refund_request.status,
            "payment_id": payment.id,
            "payment_status": payment.status,
            "refunded_at": refund_request.refunded_at,
        },
    )
    add_refund_request_status_history(
        refund_request,
        old_refund_status,
        refund_request.status,
        "Provider approved refund request",
        current_user,
        db,
    )
    create_notification(
        refund_request.customer_id,
        "Refund approved",
        "Your refund request was approved",
        NotificationType.refund_approved,
        NotificationRelatedType.refund_request,
        refund_request.id,
        db,
    )
    db.commit()
    db.refresh(refund_request)
    db.refresh(payment)
    db.refresh(booking)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)

    return {
        "message": "Refund request approved successfully",
        "refund_request": format_refund_request_response(refund_request, db),
        "booking": format_booking_detail_response(booking, db),
        "payment": format_payment_response(payment, db),
    }


async def reject_provider_refund_request_action(
    refund_request_id: int,
    reject_data: ProviderRefundRejectCreate,
    current_user: models.User,
    db: Session,
):
    """Provider rejects refund.

    Refund request becomes rejected but booking stays refunding for further discussion or admin.
    """

    provider_profile = get_provider_profile_for_user(current_user.id, db)
    refund_request = (
        db.query(models.RefundRequest)
        .filter(
            models.RefundRequest.id == refund_request_id,
            models.RefundRequest.provider_profile_id == provider_profile.id,
        )
        .first()
    )
    if not refund_request:
        raise HTTPException(status_code=404, detail="Refund request not found")
    if refund_request.status != RefundRequestStatus.pending:
        raise HTTPException(
            status_code=400, detail="Only pending refund requests can be rejected"
        )

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == refund_request.booking_id,
            models.Booking.provider_profile_id == provider_profile.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking,
        [BookingStatus.refunding],
        "Only refunding bookings can keep a rejected refund request",
    )
    old_status = booking.status
    old_refund_status = refund_request.status
    refund_request.status = RefundRequestStatus.rejected
    refund_request.provider_note = reject_data.provider_note
    refund_request.responded_at = utc_now()
    booking.status = BookingStatus.refunding
    booking.status_note = reject_data.provider_note
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Provider rejected the refund request",
        booking.status_note,
        db,
        {
            "refund_request_id": refund_request.id,
            "refund_status": refund_request.status,
            "provider_note": refund_request.provider_note,
            "responded_at": refund_request.responded_at,
        },
    )
    add_refund_request_status_history(
        refund_request,
        old_refund_status,
        refund_request.status,
        refund_request.provider_note,
        current_user,
        db,
    )
    create_notification(
        refund_request.customer_id,
        "Refund rejected",
        "Your refund request was rejected by the provider",
        NotificationType.refund_rejected,
        NotificationRelatedType.refund_request,
        refund_request.id,
        db,
    )
    db.commit()
    db.refresh(refund_request)
    db.refresh(booking)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)

    return {
        "message": "Refund request rejected. Booking remains in refunding status",
        "refund_request": format_refund_request_response(refund_request, db),
        "booking": format_booking_detail_response(booking, db),
    }


async def quote_provider_booking_action(
    booking_id: int,
    quote_data: ProviderBookingQuoteCreate,
    current_user: models.User,
    db: Session,
):
    provider_profile = get_provider_profile_for_user(current_user.id, db)
    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.provider_profile_id == provider_profile.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    require_active_provider_submerchant(
        provider_profile.id,
        db,
        booking=booking,
    )

    ensure_booking_status(
        booking, [BookingStatus.pending], "Only pending bookings can receive a quote"
    )
    old_status = booking.status
    booking.status = BookingStatus.quoted
    booking.quote_amount = quote_data.quote_amount
    booking.quote_message = quote_data.quote_message
    booking.quoted_at = utc_now()
    booking.status_note = quote_data.quote_message
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        f"Provider submitted a quote: {booking.quote_amount} TRY",
        booking.quote_message,
        db,
        {
            "quote_amount": booking.quote_amount,
            "quote_message": booking.quote_message,
            "quoted_at": booking.quoted_at,
            "currency": "TRY",
        },
    )
    create_notification(
        booking.customer_id,
        "New quote received",
        "A provider sent you a quote for your booking",
        NotificationType.booking_quoted,
        NotificationRelatedType.booking,
        booking.id,
        db,
    )
    result = save_booking(booking, db)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)
    result["booking"] = format_booking_detail_response(booking, db)
    result["message"] = "Booking quoted successfully"

    return result


async def reject_provider_booking_action(
    booking_id: int,
    note_data: BookingNoteUpdate,
    current_user: models.User,
    db: Session,
):
    provider_profile = get_provider_profile_for_user(current_user.id, db)
    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.provider_profile_id == provider_profile.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking, [BookingStatus.pending], "Only pending bookings can be rejected"
    )
    old_status = booking.status
    booking.status = BookingStatus.rejected
    booking.status_note = note_data.status_note
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Provider rejected the booking request",
        booking.status_note,
        db,
        {"reason": booking.status_note},
    )
    create_notification(
        booking.customer_id,
        "Booking rejected",
        "A provider rejected your booking request",
        NotificationType.booking_rejected,
        NotificationRelatedType.booking,
        booking.id,
        db,
    )
    result = save_booking(booking, db)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)
    result["booking"] = format_booking_detail_response(booking, db)
    result["message"] = "Booking rejected successfully"

    return result


async def complete_provider_booking_action(
    booking_id: int,
    current_user: models.User,
    db: Session,
    proof_files: list[UploadFile] | None = None,
):
    provider_profile = get_provider_profile_for_user(current_user.id, db)
    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.provider_profile_id == provider_profile.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking, [BookingStatus.accepted], "Only accepted bookings can be completed"
    )

    if not proof_files:
        raise HTTPException(
            status_code=400,
            detail="Completion proof photo or video is required",
        )

    saved_file_urls = []
    proof_attachments = []
    try:
        for file in proof_files:
            if not file.filename:
                continue
            upload_result = await save_booking_attachment_upload(booking.id, file)
            saved_file_urls.append(upload_result["file_url"])
            attachment = models.BookingAttachment(
                booking_id=booking.id,
                uploaded_by_user_id=current_user.id,
                original_file_name=upload_result["original_file_name"],
                file_name=upload_result["file_name"],
                file_url=upload_result["file_url"],
                content_type=upload_result["content_type"],
                size=upload_result["size"],
                created_at=utc_now(),
            )
            db.add(attachment)
            db.flush()
            proof_attachments.append(attachment)

        if not proof_attachments:
            raise HTTPException(
                status_code=400,
                detail="Completion proof photo or video is required",
            )

        proof_metadata = [
            {
                "id": attachment.id,
                "file_url": attachment.file_url,
                "content_type": attachment.content_type,
                "original_file_name": attachment.original_file_name,
            }
            for attachment in proof_attachments
        ]
    except Exception:
        db.rollback()
        for file_url in saved_file_urls:
            delete_local_upload(file_url)
        raise

    old_status = booking.status
    booking.status = BookingStatus.awaiting_confirmation
    booking.status_note = "Provider marked service as complete"
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Provider marked the service as complete",
        booking.status_note,
        db,
        {
            "awaiting_customer_confirmation": True,
            "proof_attachment_count": len(proof_attachments),
            "proof_attachments": proof_metadata,
        },
    )
    create_notification(
        booking.customer_id,
        "Service marked complete",
        "A provider marked your booking as complete",
        NotificationType.booking_completed_by_provider,
        NotificationRelatedType.booking,
        booking.id,
        db,
    )
    result = save_booking(booking, db)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)
    result["booking"] = format_booking_detail_response(booking, db)
    result["message"] = "Booking is waiting for customer confirmation"

    return result

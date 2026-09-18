"""Customer booking actions.

Core booking flow: create, cancel, pay, refund, acceptance, pre-review state changes.
Shared by HTTP APIs and AI confirmations for consistent state rules.
"""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend import models
from backend.schemas import (
    BookingCreate,
    BookingStatus,
    NotificationRelatedType,
    NotificationType,
    PaymentStatus,
    RefundAppealCreate,
    RefundRequestStatus,
)
from backend.utils.availability import ensure_provider_available_for_datetime_range
from backend.utils.booking import (
    add_booking_status_history,
    ensure_booking_status,
    format_booking_detail_response,
    get_active_refund_request,
    save_booking,
)
from backend.utils.chat import (
    create_booking_chat_message,
    create_booking_status_chat_message,
    format_chat_message_response,
    format_chat_room_response_with_unread,
    get_or_create_chat_room,
    push_chat_message_to_room_members,
)
from backend.utils.notification import create_admin_notifications, create_notification
from backend.utils.payment import fail_pending_payments_for_booking
from backend.utils.payment import format_payment_response
from backend.utils.refund import (
    add_refund_request_status_history,
    format_refund_request_response,
)
from backend.utils.upload import (
    delete_local_upload,
    save_booking_attachment_upload,
    validate_booking_attachments,
)
from backend.core.clock import to_workshop_datetime, utc_now


async def create_customer_booking_action(
    booking_data: BookingCreate,
    current_user: models.User,
    db: Session,
    attachments: list[UploadFile] | None = None,
):
    """Create a booking request.

    Validates provider and schedule, creates/reuses chat room, saves attachments,
    writes status history, notifies provider, and posts booking message to chat.
    """

    if current_user.role != "customer":
        raise HTTPException(
            status_code=403, detail="Only customers can create bookings"
        )

    validate_booking_attachments(attachments)
    scheduled_start_time = to_workshop_datetime(booking_data.scheduled_start_time)
    scheduled_end_time = to_workshop_datetime(booking_data.scheduled_end_time)

    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == booking_data.provider_profile_id)
        .first()
    )
    if not provider_profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    if provider_profile.verification_status != "approved":
        raise HTTPException(
            status_code=400, detail="Provider is not approved for bookings"
        )

    ensure_provider_available_for_datetime_range(
        provider_profile.id,
        scheduled_start_time,
        scheduled_end_time,
        db,
    )

    chat_room = None
    if booking_data.chat_room_id is not None:
        chat_room = (
            db.query(models.ChatRoom)
            .filter(models.ChatRoom.id == booking_data.chat_room_id)
            .first()
        )
        if not chat_room:
            raise HTTPException(status_code=404, detail="Chat room not found")
        if chat_room.customer_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only create bookings from your own chats",
            )
        if chat_room.provider_profile_id != booking_data.provider_profile_id:
            raise HTTPException(
                status_code=400,
                detail="Chat room provider does not match booking provider",
            )
    else:
        # Booking without prior chat auto-creates a room for follow-up.
        chat_room = get_or_create_chat_room(
            current_user.id, booking_data.provider_profile_id, db
        )

    saved_file_urls = []
    try:
        booking = models.Booking(
            customer_id=current_user.id,
            provider_profile_id=booking_data.provider_profile_id,
            chat_room_id=chat_room.id,
            title=booking_data.title,
            service_description=booking_data.service_description,
            service_address=booking_data.service_address,
            service_latitude=booking_data.service_latitude,
            service_longitude=booking_data.service_longitude,
            customer_current_address=booking_data.customer_current_address,
            customer_current_latitude=booking_data.customer_current_latitude,
            customer_current_longitude=booking_data.customer_current_longitude,
            booking_at=utc_now(),
            scheduled_start_time=scheduled_start_time,
            scheduled_end_time=scheduled_end_time,
            completed_at=None,
            total_amount=Decimal("0.00"),
            quote_amount=None,
            quote_message=None,
            quoted_at=None,
            status=BookingStatus.pending,
            status_note=None,
        )
        db.add(booking)
        db.flush()

        attachment_records = []
        for file in attachments or []:
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
            attachment_records.append(attachment)

        booking_chat_message = create_booking_chat_message(
            chat_room, booking, current_user.id, db, attachment_records
        )
        add_booking_status_history(
            booking,
            "created",
            booking.status,
            "Customer created booking request",
            current_user,
            db,
        )
        notification_message = "You received a new booking request"
        if attachment_records:
            notification_message = (
                f"{notification_message} with {len(attachment_records)} attachment(s)"
            )
        create_notification(
            provider_profile.user_id,
            "New booking request",
            notification_message,
            NotificationType.booking_created,
            NotificationRelatedType.booking,
            booking.id,
            db,
        )
        db.commit()
    except Exception:
        # On DB failure, delete local uploads to avoid orphan files.
        db.rollback()
        for file_url in saved_file_urls:
            delete_local_upload(file_url)
        raise

    db.refresh(booking)
    db.refresh(chat_room)
    db.refresh(booking_chat_message)
    await push_chat_message_to_room_members(booking_chat_message, db)

    return {
        "message": "Booking created successfully",
        "booking": format_booking_detail_response(booking, db),
        "chat_room": format_chat_room_response_with_unread(chat_room, db, current_user),
        "chat_message": format_chat_message_response(booking_chat_message, db),
    }


async def cancel_customer_booking_action(
    booking_id: int,
    current_user: models.User,
    db: Session,
):
    """Customer cancels booking.

    Allowed in pending/quoted/awaiting_payment; after accepted use refund flow.
    """

    if current_user.role != "customer":
        raise HTTPException(
            status_code=403, detail="Only customers can cancel bookings"
        )

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.customer_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking,
        [BookingStatus.pending, BookingStatus.quoted, BookingStatus.awaiting_payment],
        "Only pending, quoted or awaiting payment bookings can be cancelled",
    )
    old_status = booking.status
    booking.status = BookingStatus.cancelled
    booking.status_note = "Customer cancelled booking"
    failed_payment_count = fail_pending_payments_for_booking(booking, db)
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Customer cancelled the booking",
        booking.status_note,
        db,
        {
            "reason": booking.status_note,
            "failed_pending_payment_count": failed_payment_count,
        },
    )
    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == booking.provider_profile_id)
        .first()
    )
    if provider_profile:
        create_notification(
            provider_profile.user_id,
            "Booking cancelled",
            "A customer cancelled a booking",
            NotificationType.booking_cancelled,
            NotificationRelatedType.booking,
            booking.id,
            db,
        )

    result = save_booking(booking, db)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)
    result["booking"] = format_booking_detail_response(booking, db)
    result["failed_pending_payment_count"] = failed_payment_count
    result["message"] = "Booking cancelled successfully"

    return result


async def create_customer_refund_request_action(
    booking_id: int,
    service_stage: str,
    reason: str,
    current_user: models.User,
    db: Session,
):
    if current_user.role != "customer":
        raise HTTPException(
            status_code=403, detail="Only customers can request refunds"
        )

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.customer_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking,
        [
            BookingStatus.accepted,
            BookingStatus.awaiting_confirmation,
        ],
        "Only active paid or awaiting confirmation bookings can request a refund",
    )
    payment = (
        db.query(models.Payment)
        .filter(
            models.Payment.booking_id == booking.id,
            models.Payment.customer_id == current_user.id,
            models.Payment.status == PaymentStatus.paid,
        )
        .first()
    )
    if not payment:
        raise HTTPException(
            status_code=400, detail="Paid payment not found for this booking"
        )

    existing_refund_request = get_active_refund_request(booking, db)
    if existing_refund_request:
        raise HTTPException(
            status_code=400, detail="This booking already has an active refund request"
        )

    previous_status = booking.status
    refund_request = models.RefundRequest(
        booking_id=booking.id,
        payment_id=payment.id,
        customer_id=current_user.id,
        provider_profile_id=booking.provider_profile_id,
        service_stage=service_stage,
        reason=reason,
        status=RefundRequestStatus.pending,
        provider_note=None,
        appeal_reason=None,
        admin_note=None,
        previous_booking_status=previous_status,
        created_at=utc_now(),
        responded_at=None,
        appealed_at=None,
        admin_responded_at=None,
        cancelled_at=None,
        refunded_at=None,
    )
    old_status = booking.status
    booking.status = BookingStatus.refunding
    booking.status_note = reason
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    db.add(refund_request)
    db.flush()
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Customer requested a refund",
        booking.status_note,
        db,
        {
            "refund_request_id": refund_request.id,
            "refund_status": refund_request.status,
            "service_stage": refund_request.service_stage,
            "reason": refund_request.reason,
            "previous_booking_status": refund_request.previous_booking_status,
            "payment_id": payment.id,
        },
    )
    add_refund_request_status_history(
        refund_request,
        "created",
        refund_request.status,
        refund_request.reason,
        current_user,
        db,
    )
    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == booking.provider_profile_id)
        .first()
    )
    if provider_profile:
        create_notification(
            provider_profile.user_id,
            "Refund requested",
            "A customer requested a refund",
            NotificationType.refund_requested,
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
        "message": "Refund request created successfully",
        "refund_request": format_refund_request_response(refund_request, db),
        "booking": format_booking_detail_response(booking, db),
    }


async def appeal_customer_refund_request_action(
    refund_request_id: int,
    appeal_data: RefundAppealCreate,
    current_user: models.User,
    db: Session,
):
    """Customer appeals to admin after provider rejects refund."""

    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can appeal refunds")

    refund_request = (
        db.query(models.RefundRequest)
        .filter(
            models.RefundRequest.id == refund_request_id,
            models.RefundRequest.customer_id == current_user.id,
        )
        .first()
    )
    if not refund_request:
        raise HTTPException(status_code=404, detail="Refund request not found")
    if refund_request.status != RefundRequestStatus.rejected:
        raise HTTPException(
            status_code=400,
            detail="Only provider rejected refund requests can be appealed",
        )

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == refund_request.booking_id,
            models.Booking.customer_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking,
        [BookingStatus.refunding],
        "Only refunding bookings can be appealed",
    )
    old_refund_status = refund_request.status
    refund_request.status = RefundRequestStatus.appealed
    refund_request.appeal_reason = appeal_data.appeal_reason
    refund_request.appealed_at = utc_now()
    booking.status_note = appeal_data.appeal_reason
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        booking.status,
        current_user.id,
        "Customer appealed the rejected refund request",
        booking.status_note,
        db,
        {
            "refund_request_id": refund_request.id,
            "refund_status": refund_request.status,
            "appeal_reason": refund_request.appeal_reason,
            "appealed_at": refund_request.appealed_at,
        },
    )
    add_refund_request_status_history(
        refund_request,
        old_refund_status,
        refund_request.status,
        refund_request.appeal_reason,
        current_user,
        db,
    )
    create_admin_notifications(
        "Refund appeal submitted",
        "A customer appealed a rejected refund request",
        NotificationType.refund_appealed,
        NotificationRelatedType.refund_request,
        refund_request.id,
        db,
    )
    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == refund_request.provider_profile_id)
        .first()
    )
    if provider_profile:
        create_notification(
            provider_profile.user_id,
            "Refund appeal submitted",
            "The customer appealed your refund decision to customer service",
            NotificationType.refund_appealed,
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
        "message": "Refund request appealed successfully",
        "refund_request": format_refund_request_response(refund_request, db),
        "booking": format_booking_detail_response(booking, db),
    }


async def pay_customer_booking_action(
    booking_id: int,
    payment_method: str,
    current_user: models.User,
    db: Session,
):
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can pay bookings")

    if not payment_method.strip():
        raise HTTPException(status_code=400, detail="Payment method cannot be empty")

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.customer_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking,
        [BookingStatus.awaiting_payment],
        "Only awaiting payment bookings can be paid",
    )
    if booking.quote_amount is None:
        raise HTTPException(status_code=400, detail="Booking has no quote amount")

    payment = (
        db.query(models.Payment)
        .filter(
            models.Payment.booking_id == booking.id,
            models.Payment.customer_id == current_user.id,
            models.Payment.status == PaymentStatus.pending,
        )
        .first()
    )
    if not payment:
        raise HTTPException(
            status_code=400,
            detail="Pending payment not found for this booking",
        )

    now = utc_now()
    payment.payment_method = payment_method.strip()
    payment.status = PaymentStatus.paid
    payment.paid_at = now
    payment.external_payment_id = f"mock-payment-{payment.id}"

    old_status = booking.status
    booking.status = BookingStatus.accepted
    booking.total_amount = payment.amount
    booking.status_note = "Customer paid the quoted amount"
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Customer paid the quote and accepted the booking",
        booking.status_note,
        db,
        {
            "payment_id": payment.id,
            "payment_status": payment.status,
            "amount": payment.amount,
            "currency": payment.currency,
            "paid_at": payment.paid_at,
        },
    )
    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == booking.provider_profile_id)
        .first()
    )
    if provider_profile:
        create_notification(
            provider_profile.user_id,
            "Payment received",
            "A customer paid for your quoted booking",
            NotificationType.payment_paid,
            NotificationRelatedType.payment,
            payment.id,
            db,
        )

    db.commit()
    db.refresh(payment)
    db.refresh(booking)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)

    return {
        "message": "Payment completed and booking moved to implementation stage",
        "payment": format_payment_response(payment, db),
        "booking": format_booking_detail_response(booking, db),
    }


async def accept_customer_booking_quote_action(
    booking_id: int,
    current_user: models.User,
    db: Session,
):
    if current_user.role != "customer":
        raise HTTPException(
            status_code=403, detail="Only customers can accept booking quotes"
        )

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.customer_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking, [BookingStatus.quoted], "Only quoted bookings can be accepted"
    )
    if booking.quote_amount is None:
        raise HTTPException(status_code=400, detail="Booking has no quote amount")

    existing_payment = (
        db.query(models.Payment)
        .filter(
            models.Payment.booking_id == booking.id,
            models.Payment.status.in_([PaymentStatus.pending, PaymentStatus.paid]),
        )
        .first()
    )
    if existing_payment:
        raise HTTPException(
            status_code=400,
            detail="This booking already has a pending or paid payment",
        )

    now = utc_now()
    payment = models.Payment(
        booking_id=booking.id,
        customer_id=current_user.id,
        provider_profile_id=booking.provider_profile_id,
        amount=booking.quote_amount,
        currency="TRY",
        status=PaymentStatus.pending,
        payment_method="mock",
        external_payment_id=None,
        created_at=now,
        paid_at=None,
        refunded_at=None,
    )
    db.add(payment)
    db.flush()

    old_status = booking.status
    booking.status = BookingStatus.awaiting_payment
    booking.status_note = "Customer accepted the quote and is waiting to pay"
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Customer accepted the quote. Payment is pending",
        booking.status_note,
        db,
        {
            "payment_id": payment.id,
            "payment_status": payment.status,
            "amount": payment.amount,
            "currency": payment.currency,
        },
    )
    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == booking.provider_profile_id)
        .first()
    )
    if provider_profile:
        create_notification(
            provider_profile.user_id,
            "Quote accepted",
            "A customer accepted your quote and is waiting to pay",
            NotificationType.booking_quote_accepted,
            NotificationRelatedType.booking,
            booking.id,
            db,
        )

    db.commit()
    db.refresh(payment)
    db.refresh(booking)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)

    return {
        "message": "Quote accepted. Payment is pending",
        "payment": format_payment_response(payment, db),
        "booking": format_booking_detail_response(booking, db),
        "chat_message": (
            format_chat_message_response(booking_status_chat_message, db)
            if booking_status_chat_message
            else None
        ),
    }


async def reject_customer_booking_quote_action(
    booking_id: int,
    status_note: str,
    current_user: models.User,
    db: Session,
):
    if current_user.role != "customer":
        raise HTTPException(
            status_code=403, detail="Only customers can reject booking quotes"
        )

    if not status_note.strip():
        raise HTTPException(status_code=400, detail="Status note cannot be empty")

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.customer_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking, [BookingStatus.quoted], "Only quoted bookings can reject a quote"
    )
    old_status = booking.status
    booking.status = BookingStatus.pending
    booking.status_note = status_note.strip()
    booking.quote_amount = None
    booking.quote_message = None
    booking.quoted_at = None
    failed_payment_count = fail_pending_payments_for_booking(booking, db)
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Customer rejected the quote",
        booking.status_note,
        db,
        {
            "reason": booking.status_note,
            "failed_pending_payment_count": failed_payment_count,
        },
    )
    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == booking.provider_profile_id)
        .first()
    )
    if provider_profile:
        create_notification(
            provider_profile.user_id,
            "Quote rejected",
            "A customer rejected your quote",
            NotificationType.booking_quote_rejected,
            NotificationRelatedType.booking,
            booking.id,
            db,
        )

    result = save_booking(booking, db)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)
    result["booking"] = format_booking_detail_response(booking, db)
    result["failed_pending_payment_count"] = failed_payment_count
    result["message"] = "Quote rejected. Provider can submit another quote"

    return result


async def confirm_customer_booking_complete_action(
    booking_id: int,
    current_user: models.User,
    db: Session,
):
    if current_user.role != "customer":
        raise HTTPException(
            status_code=403,
            detail="Only customers can confirm booking completion",
        )

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.customer_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking,
        [BookingStatus.awaiting_confirmation],
        "Only bookings waiting for confirmation can be completed",
    )
    old_status = booking.status
    booking.status = BookingStatus.completed
    booking.completed_at = utc_now()
    booking.status_note = "Customer confirmed service completion"
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Customer confirmed service completion",
        booking.status_note,
        db,
        {"completed_at": booking.completed_at},
    )
    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == booking.provider_profile_id)
        .first()
    )
    if provider_profile:
        create_notification(
            provider_profile.user_id,
            "Completion confirmed",
            "A customer confirmed your completed service",
            NotificationType.booking_completion_confirmed,
            NotificationRelatedType.booking,
            booking.id,
            db,
        )

    result = save_booking(booking, db)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)
    result["booking"] = format_booking_detail_response(booking, db)
    result["message"] = "Booking completed successfully"

    return result


async def reject_customer_booking_complete_action(
    booking_id: int,
    status_note: str,
    current_user: models.User,
    db: Session,
):
    if current_user.role != "customer":
        raise HTTPException(
            status_code=403,
            detail="Only customers can reject booking completion",
        )

    if not status_note.strip():
        raise HTTPException(status_code=400, detail="Status note cannot be empty")

    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.customer_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_status(
        booking,
        [BookingStatus.awaiting_confirmation],
        "Only bookings waiting for confirmation can be rejected",
    )
    old_status = booking.status
    booking.status = BookingStatus.accepted
    booking.status_note = status_note.strip()
    add_booking_status_history(
        booking, old_status, booking.status, booking.status_note, current_user, db
    )
    booking_status_chat_message = create_booking_status_chat_message(
        booking,
        old_status,
        current_user.id,
        "Customer rejected service completion",
        booking.status_note,
        db,
        {"reason": booking.status_note},
    )
    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == booking.provider_profile_id)
        .first()
    )
    if provider_profile:
        create_notification(
            provider_profile.user_id,
            "Completion rejected",
            "A customer rejected your completion confirmation",
            NotificationType.booking_completion_rejected,
            NotificationRelatedType.booking,
            booking.id,
            db,
        )

    result = save_booking(booking, db)
    if booking_status_chat_message:
        db.refresh(booking_status_chat_message)
        await push_chat_message_to_room_members(booking_status_chat_message, db)
    result["booking"] = format_booking_detail_response(booking, db)
    result["message"] = "Completion confirmation rejected"

    return result

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
from backend.config import IYZICO_CALLBACK_URL
from backend.services import iyzico as iyzico_service


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
    if getattr(provider_profile, "qualification_verification_status", provider_profile.verification_status) != "approved":
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


def _checkout_buyer_details(
    booking: models.Booking,
    current_user: models.User,
    db: Session,
) -> tuple[dict, dict]:
    customer_profile = (
        db.query(models.CustomerProfile)
        .filter(models.CustomerProfile.user_id == current_user.id)
        .first()
    )
    name_parts = (current_user.name or "Workshop Customer").split(maxsplit=1)
    first_name = current_user.first_name or name_parts[0]
    last_name = current_user.last_name or (name_parts[1] if len(name_parts) > 1 else "Customer")
    city = (
        customer_profile.service_province
        if customer_profile and customer_profile.service_province
        else "Istanbul"
    )
    phone = (
        customer_profile.phone_number
        if customer_profile and customer_profile.phone_number
        else "+905000000000"
    )
    registration_date = (current_user.created_at or utc_now()).strftime("%Y-%m-%d %H:%M:%S")
    last_login_date = (current_user.last_login_at or current_user.created_at or utc_now()).strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    buyer = {
        "id": str(current_user.id),
        "name": first_name,
        "surname": last_name,
        "identityNumber": str(current_user.id).zfill(11),
        "email": current_user.email,
        "gsmNumber": phone,
        "registrationDate": registration_date,
        "lastLoginDate": last_login_date,
        "registrationAddress": booking.service_address,
        "city": city,
        "country": "Turkey",
        "ip": "127.0.0.1",
    }
    address = {
        "address": booking.service_address,
        "contactName": current_user.name or f"{first_name} {last_name}",
        "city": city,
        "country": "Turkey",
    }
    return buyer, address


def _build_checkout_payload(
    booking: models.Booking,
    payment: models.Payment,
    current_user: models.User,
    db: Session,
) -> dict:
    buyer, address = _checkout_buyer_details(booking, current_user, db)
    amount = float(payment.amount)
    return {
        "locale": "en",
        "conversationId": payment.conversation_id,
        "price": amount,
        "paidPrice": amount,
        "currency": payment.currency,
        "basketId": payment.basket_id,
        "paymentGroup": "PRODUCT",
        "callbackUrl": IYZICO_CALLBACK_URL,
        "buyer": buyer,
        "shippingAddress": address,
        "billingAddress": address,
        "basketItems": [
            {
                "id": str(booking.id),
                "price": amount,
                "name": booking.title,
                "category1": "Service",
                "itemType": "VIRTUAL",
            }
        ],
    }


def _external_amount_matches(payment: models.Payment, result: dict) -> bool:
    raw_amount = result.get("paidPrice", result.get("price"))
    if raw_amount is None:
        return False
    try:
        return Decimal(str(raw_amount)).quantize(Decimal("0.01")) == Decimal(
            str(payment.amount)
        ).quantize(Decimal("0.01"))
    except Exception:
        return False


async def apply_iyzico_checkout_result(
    payment: models.Payment,
    result: dict,
    db: Session,
):
    booking = (
        db.query(models.Booking)
        .filter(models.Booking.id == payment.booking_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if payment.status in [PaymentStatus.paid, PaymentStatus.refunded]:
        return {
            "message": "Payment result was already finalized",
            "payment": format_payment_response(payment, db),
            "booking": format_booking_detail_response(booking, db),
        }

    external_status = str(result.get("paymentStatus") or result.get("status") or "").lower()
    payment.external_status = external_status or None
    iyzico_payment_id = result.get("paymentId")
    if iyzico_payment_id:
        payment.iyzico_payment_id = str(iyzico_payment_id)
        payment.external_payment_id = str(iyzico_payment_id)

    fraud_status = result.get("fraudStatus")
    if external_status != "success" or fraud_status == -1:
        payment.status = PaymentStatus.failed
        payment.failed_at = utc_now()
        payment.failure_code = str(result.get("errorCode") or "payment_failed")
        payment.failure_message = str(result.get("errorMessage") or "iyzico payment failed")
        db.commit()
        db.refresh(payment)
        db.refresh(booking)
        return {
            "message": "Payment failed",
            "payment": format_payment_response(payment, db),
            "booking": format_booking_detail_response(booking, db),
        }

    if fraud_status == 0:
        payment.status = PaymentStatus.processing
        db.commit()
        db.refresh(payment)
        db.refresh(booking)
        return {
            "message": "Payment is pending iyzico review",
            "payment": format_payment_response(payment, db),
            "booking": format_booking_detail_response(booking, db),
        }

    if not _external_amount_matches(payment, result):
        payment.status = PaymentStatus.failed
        payment.failed_at = utc_now()
        payment.failure_code = "payment_amount_mismatch"
        payment.failure_message = "iyzico amount does not match the local payment amount"
        db.commit()
        raise HTTPException(status_code=400, detail=payment.failure_message)

    result_currency = str(result.get("currency") or payment.currency).upper()
    if result_currency != payment.currency.upper():
        payment.status = PaymentStatus.failed
        payment.failed_at = utc_now()
        payment.failure_code = "payment_currency_mismatch"
        payment.failure_message = "iyzico currency does not match the local payment currency"
        db.commit()
        raise HTTPException(status_code=400, detail=payment.failure_message)

    transactions = result.get("itemTransactions") or []
    if transactions and isinstance(transactions[0], dict):
        transaction_id = transactions[0].get("paymentTransactionId")
        if transaction_id:
            payment.payment_transaction_id = str(transaction_id)

    now = utc_now()
    payment.status = PaymentStatus.paid
    payment.payment_method = "iyzico_checkout"
    payment.paid_at = now
    payment.failed_at = None
    payment.failure_code = None
    payment.failure_message = None

    if booking.status == BookingStatus.awaiting_payment:
        old_status = booking.status
        booking.status = BookingStatus.accepted
        booking.total_amount = payment.amount
        booking.status_note = "Customer paid the quoted amount through iyzico Sandbox"
        add_booking_status_history(
            booking,
            old_status,
            booking.status,
            booking.status_note,
            db.get(models.User, payment.customer_id),
            db,
        )
        booking_status_chat_message = create_booking_status_chat_message(
            booking,
            old_status,
            payment.customer_id,
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
    else:
        booking_status_chat_message = None

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
            models.Payment.status.in_(
                [
                    PaymentStatus.pending,
                    PaymentStatus.checkout_created,
                    PaymentStatus.processing,
                ]
            ),
        )
        .first()
    )
    if not payment:
        raise HTTPException(
            status_code=400,
            detail="Pending payment not found for this booking",
        )

    if payment.status in [PaymentStatus.checkout_created, PaymentStatus.processing]:
        return {
            "message": "Payment checkout already created",
            "payment": format_payment_response(payment, db),
            "booking": format_booking_detail_response(booking, db),
            "payment_page_url": payment.checkout_url,
            "token": payment.iyzico_token,
        }

    now = utc_now()
    payment.payment_method = "iyzico_checkout"
    payment.conversation_id = payment.conversation_id or (
        f"booking-{booking.id}-payment-{payment.id}"
    )
    payment.basket_id = payment.basket_id or payment.conversation_id
    checkout_payload = _build_checkout_payload(booking, payment, current_user, db)
    try:
        result = await iyzico_service.get_iyzico_client().initialize_checkout_form(
            checkout_payload
        )
    except iyzico_service.IyzicoClientError as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if str(result.get("status", "")).lower() != "success":
        payment.external_status = str(result.get("status") or "failure")
        payment.failure_code = str(result.get("errorCode") or "checkout_initialize_failed")
        payment.failure_message = str(
            result.get("errorMessage") or "iyzico checkout initialization failed"
        )
        db.commit()
        raise HTTPException(status_code=502, detail=payment.failure_message)

    token = result.get("token")
    checkout_url = result.get("paymentPageUrl")
    if not token or not checkout_url:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="iyzico checkout response did not include a payment page",
        )

    payment.status = PaymentStatus.checkout_created
    payment.iyzico_token = str(token)
    payment.checkout_url = str(checkout_url)
    payment.external_status = "checkout_created"
    payment.failed_at = None
    payment.failure_code = None
    payment.failure_message = None
    db.commit()
    db.refresh(payment)
    db.refresh(booking)
    return {
        "message": "iyzico checkout created",
        "payment": format_payment_response(payment, db),
        "booking": format_booking_detail_response(booking, db),
        "payment_page_url": payment.checkout_url,
        "token": payment.iyzico_token,
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
            models.Payment.status.in_(
                [
                    PaymentStatus.pending,
                    PaymentStatus.checkout_created,
                    PaymentStatus.processing,
                    PaymentStatus.paid,
                ]
            ),
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
        payment_method="iyzico_checkout",
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

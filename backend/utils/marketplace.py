from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend import models
from backend.core.clock import utc_now
from backend.config import PLATFORM_COMMISSION_RATE as PLATFORM_COMMISSION_RATE_CONFIG
from backend.schemas import BookingStatus, SettlementStatus, SubmerchantStatus


PLATFORM_COMMISSION_RATE = Decimal(PLATFORM_COMMISSION_RATE_CONFIG)
UNPAID_BOOKING_STATUSES = {
    BookingStatus.pending.value,
    BookingStatus.quoted.value,
    BookingStatus.awaiting_payment.value,
}
ONBOARDING_PAUSE_REASON = "provider_onboarding_required"


def calculate_commission(amount: Decimal) -> tuple[Decimal, Decimal]:
    platform_amount = (amount * PLATFORM_COMMISSION_RATE).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    provider_amount = (amount - platform_amount).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return platform_amount, provider_amount


def get_provider_submerchant(
    provider_profile_id: int,
    db: Session,
    *,
    for_update: bool = False,
) -> models.ProviderSubmerchant | None:
    query = db.query(models.ProviderSubmerchant).filter(
        models.ProviderSubmerchant.provider_profile_id == provider_profile_id
    )
    if for_update:
        query = query.with_for_update()
    return query.first()


def is_provider_submerchant_active(
    provider_profile_id: int,
    db: Session,
) -> bool:
    submerchant = get_provider_submerchant(provider_profile_id, db)
    return bool(
        submerchant
        and submerchant.status == SubmerchantStatus.active.value
        and submerchant.submerchant_key
    )


def refresh_provider_onboarding_holds(
    provider_profile_id: int,
    db: Session,
    *,
    active: bool,
) -> int:
    query = db.query(models.Booking).filter(
        models.Booking.provider_profile_id == provider_profile_id,
        models.Booking.status.in_(UNPAID_BOOKING_STATUSES),
    )
    bookings = query.all()
    changed = 0
    now = utc_now()
    for booking in bookings:
        if active:
            if booking.onboarding_paused:
                booking.onboarding_paused = False
                booking.onboarding_pause_reason = None
                booking.onboarding_paused_at = None
                changed += 1
        elif not booking.onboarding_paused:
            booking.onboarding_paused = True
            booking.onboarding_pause_reason = ONBOARDING_PAUSE_REASON
            booking.onboarding_paused_at = now
            changed += 1
    return changed


def require_active_provider_submerchant(
    provider_profile_id: int,
    db: Session,
    *,
    booking: models.Booking | None = None,
) -> models.ProviderSubmerchant:
    submerchant = get_provider_submerchant(provider_profile_id, db)
    if not (
        submerchant
        and submerchant.status == SubmerchantStatus.active.value
        and submerchant.submerchant_key
    ):
        if booking and booking.status in UNPAID_BOOKING_STATUSES:
            booking.onboarding_paused = True
            booking.onboarding_pause_reason = ONBOARDING_PAUSE_REASON
            booking.onboarding_paused_at = booking.onboarding_paused_at or utc_now()
            db.commit()
        raise HTTPException(
            status_code=409,
            detail={
                "code": "SUBMERCHANT_REQUIRED",
                "message": "Complete the provider payout account before continuing this booking",
            },
        )
    return submerchant


def format_submerchant_response(
    submerchant: models.ProviderSubmerchant | None,
):
    if not submerchant:
        return None
    return {
        "id": submerchant.id,
        "provider_profile_id": submerchant.provider_profile_id,
        "submerchant_type": submerchant.submerchant_type,
        "submerchant_external_id": submerchant.submerchant_external_id,
        "name": submerchant.name,
        "email": submerchant.email,
        "gsm_number": submerchant.gsm_number,
        "address": submerchant.address,
        "iban": submerchant.iban,
        "contact_name": submerchant.contact_name,
        "contact_surname": submerchant.contact_surname,
        "identity_number": submerchant.identity_number,
        "tax_office": submerchant.tax_office,
        "tax_number": submerchant.tax_number,
        "legal_company_title": submerchant.legal_company_title,
        "currency": submerchant.currency,
        "status": submerchant.status,
        "iyzico_error_code": submerchant.iyzico_error_code,
        "iyzico_error_message": submerchant.iyzico_error_message,
        "last_synced_at": submerchant.last_synced_at,
        "created_at": submerchant.created_at,
        "updated_at": submerchant.updated_at,
    }


def _parse_iyzico_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace(" ", "T"))
    except ValueError:
        return None


def ensure_payment_settlement(
    payment: models.Payment,
    db: Session,
    *,
    transaction: dict | None = None,
) -> models.PaymentSettlement:
    settlement = (
        db.query(models.PaymentSettlement)
        .filter(models.PaymentSettlement.payment_id == payment.id)
        .with_for_update()
        .first()
    )
    platform_amount, provider_amount = calculate_commission(payment.amount)
    if not settlement:
        settlement = models.PaymentSettlement(
            payment_id=payment.id,
            booking_id=payment.booking_id,
            provider_profile_id=payment.provider_profile_id,
            platform_commission_rate=PLATFORM_COMMISSION_RATE,
            platform_commission_amount=platform_amount,
            provider_share_amount=provider_amount,
            payment_transaction_id=payment.payment_transaction_id,
            status=SettlementStatus.pending.value,
        )
        db.add(settlement)
    else:
        settlement.payment_transaction_id = (
            payment.payment_transaction_id or settlement.payment_transaction_id
        )

    if transaction:
        settlement.payment_transaction_id = str(
            transaction.get("paymentTransactionId")
            or settlement.payment_transaction_id
            or ""
        ) or None
        settlement.iyzico_commission_rate_amount = _decimal_or_none(
            transaction.get("iyziCommissionRateAmount")
        )
        settlement.iyzico_commission_fee = _decimal_or_none(
            transaction.get("iyziCommissionFee")
        )
        settlement.blockage_rate = _decimal_or_none(transaction.get("blockageRate"))
        settlement.blockage_resolved_at = _parse_iyzico_datetime(
            transaction.get("blockageResolvedDate")
        )
        settlement.provider_payout_amount = _decimal_or_none(
            transaction.get("subMerchantPayoutAmount")
        )
        settlement.merchant_payout_amount = _decimal_or_none(
            transaction.get("merchantPayoutAmount")
        )
    return settlement


def _decimal_or_none(value) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def format_payment_settlement(settlement: models.PaymentSettlement | None):
    if not settlement:
        return None
    return {
        "id": settlement.id,
        "payment_id": settlement.payment_id,
        "booking_id": settlement.booking_id,
        "provider_profile_id": settlement.provider_profile_id,
        "platform_commission_rate": settlement.platform_commission_rate,
        "platform_commission_amount": settlement.platform_commission_amount,
        "provider_share_amount": settlement.provider_share_amount,
        "status": settlement.status,
        "payment_transaction_id": settlement.payment_transaction_id,
        "approve_requested_at": settlement.approve_requested_at,
        "approved_at": settlement.approved_at,
        "failure_code": settlement.failure_code,
        "failure_message": settlement.failure_message,
        "retry_count": settlement.retry_count,
        "iyzico_commission_rate_amount": settlement.iyzico_commission_rate_amount,
        "iyzico_commission_fee": settlement.iyzico_commission_fee,
        "blockage_rate": settlement.blockage_rate,
        "blockage_resolved_at": settlement.blockage_resolved_at,
        "provider_payout_amount": settlement.provider_payout_amount,
        "merchant_payout_amount": settlement.merchant_payout_amount,
        "created_at": settlement.created_at,
        "updated_at": settlement.updated_at,
    }

from sqlalchemy.orm import Session

from backend import models
from backend.core.clock import utc_now
from backend.schemas import ProviderSubmerchantUpsert, SubmerchantStatus
from backend.services import iyzico as iyzico_service
from backend.utils.marketplace import (
    format_submerchant_response,
    refresh_provider_onboarding_holds,
)


def _iyzico_error_details(exc: iyzico_service.IyzicoClientError) -> tuple[str, str]:
    response_data = exc.response_data or {}
    return (
        str(response_data.get("errorCode") or "iyzico_request_failed"),
        str(response_data.get("errorMessage") or str(exc)),
    )


def _submerchant_payload(
    data: ProviderSubmerchantUpsert,
    external_id: str,
) -> dict:
    payload = {
        "locale": "en",
        "subMerchantType": data.submerchant_type.value,
        "name": data.name,
        "email": str(data.email),
        "gsmNumber": data.gsm_number,
        "address": data.address,
        "iban": data.iban,
        "currency": data.currency,
        "subMerchantExternalId": external_id,
    }
    optional_fields = {
        "contactName": data.contact_name,
        "contactSurname": data.contact_surname,
        "identityNumber": data.identity_number,
        "taxOffice": data.tax_office,
        "taxNumber": data.tax_number,
        "legalCompanyTitle": data.legal_company_title,
    }
    payload.update({key: value for key, value in optional_fields.items() if value})
    return {key: value for key, value in payload.items() if value is not None}


def _apply_submerchant_data(
    submerchant: models.ProviderSubmerchant,
    data: ProviderSubmerchantUpsert,
) -> None:
    submerchant.submerchant_type = data.submerchant_type.value
    submerchant.name = data.name
    submerchant.email = str(data.email)
    submerchant.gsm_number = data.gsm_number
    submerchant.address = data.address
    submerchant.iban = data.iban
    submerchant.contact_name = data.contact_name
    submerchant.contact_surname = data.contact_surname
    submerchant.identity_number = data.identity_number
    submerchant.tax_office = data.tax_office
    submerchant.tax_number = data.tax_number
    submerchant.legal_company_title = data.legal_company_title
    submerchant.currency = data.currency


async def upsert_provider_submerchant(
    provider_profile: models.ProviderProfile,
    data: ProviderSubmerchantUpsert,
    db: Session,
):
    submerchant = (
        db.query(models.ProviderSubmerchant)
        .filter(models.ProviderSubmerchant.provider_profile_id == provider_profile.id)
        .with_for_update()
        .first()
    )
    external_id = f"provider-{provider_profile.id}"
    if submerchant and submerchant.submerchant_key:
        if submerchant.submerchant_type != data.submerchant_type.value:
            raise ValueError("Submerchant type cannot be changed after activation")
        _apply_submerchant_data(submerchant, data)
    elif not submerchant:
        submerchant = models.ProviderSubmerchant(
            provider_profile_id=provider_profile.id,
            submerchant_type=data.submerchant_type.value,
            submerchant_external_id=external_id,
            email=str(data.email),
            gsm_number=data.gsm_number,
            address=data.address,
        )
        db.add(submerchant)
        db.flush()
        _apply_submerchant_data(submerchant, data)
    else:
        _apply_submerchant_data(submerchant, data)

    payload = _submerchant_payload(data, submerchant.submerchant_external_id)
    try:
        if submerchant.submerchant_key:
            payload.pop("subMerchantType", None)
            payload["subMerchantKey"] = submerchant.submerchant_key
            result = await iyzico_service.get_iyzico_client().update_submerchant(payload)
        else:
            result = await iyzico_service.get_iyzico_client().create_submerchant(payload)
    except iyzico_service.IyzicoClientError as exc:
        code, message = _iyzico_error_details(exc)
        submerchant.status = (
            SubmerchantStatus.update_failed.value
            if submerchant.submerchant_key
            else SubmerchantStatus.rejected.value
        )
        submerchant.iyzico_error_code = code
        submerchant.iyzico_error_message = message
        refresh_provider_onboarding_holds(provider_profile.id, db, active=False)
        db.commit()
        db.refresh(submerchant)
        return format_submerchant_response(submerchant)

    if str(result.get("status", "")).lower() != "success":
        code = str(result.get("errorCode") or "iyzico_rejected")
        message = str(result.get("errorMessage") or "iyzico rejected the submerchant")
        submerchant.status = (
            SubmerchantStatus.update_failed.value
            if submerchant.submerchant_key
            else SubmerchantStatus.rejected.value
        )
        submerchant.iyzico_error_code = code
        submerchant.iyzico_error_message = message
        refresh_provider_onboarding_holds(provider_profile.id, db, active=False)
    else:
        returned_key = result.get("subMerchantKey")
        if returned_key:
            submerchant.submerchant_key = str(returned_key)
        submerchant.status = SubmerchantStatus.active.value
        submerchant.iyzico_error_code = None
        submerchant.iyzico_error_message = None
        if not submerchant.submerchant_key:
            submerchant.status = SubmerchantStatus.rejected.value
            submerchant.iyzico_error_code = "submerchant_key_missing"
            submerchant.iyzico_error_message = (
                "iyzico did not return a subMerchantKey"
            )
            refresh_provider_onboarding_holds(provider_profile.id, db, active=False)
        else:
            submerchant.last_synced_at = utc_now()
            refresh_provider_onboarding_holds(provider_profile.id, db, active=True)

    db.commit()
    db.refresh(submerchant)
    return format_submerchant_response(submerchant)

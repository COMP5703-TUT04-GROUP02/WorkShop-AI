from sqlalchemy.orm import Session

from backend import models
from backend.schemas import ProviderSubmerchantUpsert, SubmerchantStatus
from backend.utils.marketplace import (
    format_submerchant_response,
    refresh_provider_onboarding_holds,
)


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
    if not submerchant:
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

    submerchant.status = SubmerchantStatus.active.value
    submerchant.iyzico_error_code = None
    submerchant.iyzico_error_message = None
    submerchant.last_synced_at = None
    refresh_provider_onboarding_holds(provider_profile.id, db, active=True)

    db.commit()
    db.refresh(submerchant)
    return format_submerchant_response(submerchant)

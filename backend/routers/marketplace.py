"""Marketplace onboarding and settlement controls."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from backend import models
from backend.auth import get_db, require_admin, require_provider
from backend.schemas import ProviderSubmerchantUpsert
from backend.services.marketplace import upsert_provider_submerchant
from backend.tasks.marketplace_tasks import enqueue_payment_settlement
from backend.utils.marketplace import (
    format_payment_settlement,
    format_submerchant_response,
    get_provider_submerchant,
)
from backend.utils.provider import get_provider_profile_for_user
from backend.utils.response import success_response
from backend.utils.router import ApiRouter


router = ApiRouter(tags=["Marketplace"])


@router.get("/provider/submerchant")
def get_provider_submerchant_profile(
    current_user: models.User = Depends(require_provider),
    db: Session = Depends(get_db),
):
    provider_profile = get_provider_profile_for_user(current_user.id, db)
    submerchant = get_provider_submerchant(provider_profile.id, db)
    return success_response({"submerchant": format_submerchant_response(submerchant)})


@router.post("/provider/submerchant")
async def create_provider_submerchant_profile(
    data: ProviderSubmerchantUpsert,
    current_user: models.User = Depends(require_provider),
    db: Session = Depends(get_db),
):
    provider_profile = get_provider_profile_for_user(current_user.id, db)
    try:
        submerchant = await upsert_provider_submerchant(provider_profile, data, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return success_response({"submerchant": submerchant})


@router.put("/provider/submerchant")
async def update_provider_submerchant_profile(
    data: ProviderSubmerchantUpsert,
    current_user: models.User = Depends(require_provider),
    db: Session = Depends(get_db),
):
    provider_profile = get_provider_profile_for_user(current_user.id, db)
    try:
        submerchant = await upsert_provider_submerchant(provider_profile, data, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return success_response({"submerchant": submerchant})


@router.post("/admin/payments/{payment_id}/settlement/retry")
def retry_payment_settlement(
    payment_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    del current_user
    settlement = (
        db.query(models.PaymentSettlement)
        .filter(models.PaymentSettlement.payment_id == payment_id)
        .first()
    )
    if not settlement:
        raise HTTPException(status_code=404, detail="Payment settlement not found")
    if settlement.status == "approved":
        return success_response(
            {
                "queued": False,
                "settlement": format_payment_settlement(settlement),
            }
        )
    settlement.failure_code = None
    settlement.failure_message = None
    db.commit()
    queued = enqueue_payment_settlement(payment_id)
    db.refresh(settlement)
    return success_response(
        {
            "queued": queued,
            "settlement": format_payment_settlement(settlement),
        }
    )

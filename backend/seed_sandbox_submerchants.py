"""Populate demo provider payout details and synchronize Sandbox onboarding."""

import asyncio

from backend import models
from backend.database import SessionLocal
from backend.schemas import ProviderSubmerchantUpsert
from backend.services.marketplace import upsert_provider_submerchant
from backend.utils.marketplace_seed import (
    build_demo_submerchant_data,
    ensure_demo_submerchant_drafts,
)


async def run() -> None:
    db = SessionLocal()
    try:
        ensure_demo_submerchant_drafts(db)
        db.commit()
        rows = (
            db.query(models.ProviderSubmerchant, models.ProviderProfile)
            .join(
                models.ProviderProfile,
                models.ProviderProfile.id == models.ProviderSubmerchant.provider_profile_id,
            )
            .filter(
                (models.ProviderSubmerchant.status != "active")
                | (models.ProviderSubmerchant.submerchant_key.is_(None))
            )
            .order_by(models.ProviderSubmerchant.id.asc())
            .all()
        )
        success = 0
        failed = 0
        for submerchant, provider in rows:
            user = db.get(models.User, provider.user_id)
            if not user:
                continue
            values = build_demo_submerchant_data(provider, user)
            result = await upsert_provider_submerchant(
                provider,
                ProviderSubmerchantUpsert(**values),
                db,
            )
            if result and result["status"] == "active":
                success += 1
            else:
                failed += 1
                print(
                    f"{user.email}: {result['status']} "
                    f"{result.get('iyzico_error_code')}: "
                    f"{result.get('iyzico_error_message')}"
                )
        print(f"Sandbox submerchant initialization complete: active={success}, failed={failed}")
    finally:
        db.close()


def main():
    asyncio.run(run())


if __name__ == "__main__":
    main()

"""Build the reviewed, deterministic data snapshot used by migration 0018.

This is an authoring tool, not an application seed command. Docker startup does
not run it. Commit the generated JSON whenever the reviewed sample changes.
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.location_data import iter_location_seeds


OUTPUT = ROOT / "migrations" / "data" / "0018_workshop_samples.json"
PASSWORD_HASH = "$2b$12$7BRnl3Pt1eg7OOqWfwDgb.NXMyr4KtXPxwZ4EXK//JDwXUoyDoHdm"
PASSWORD = "Demo1234"
PAYOUT_IBAN = "TR180006200119000006672315"
PAYOUT_IDENTITY_NUMBER = "31300864726"
PAYOUT_SYNCED_AT = "2026-10-13T03:30:01.411592+00:00"
PAYOUT_SUBMERCHANT_KEYS = (
    "hVb8tbfZL1uEz5v1791699327169",
    "MNnjjMNKnafSjE51791861959407",
    "AOcq0ttAP8ar6SW1791861968922",
    "puVKJ9lCO0cCiys1791861978379",
    "qmRHiBKpqkKDSQY1791861986711",
    "9SCU0J2dGXishlZ1791861995160",
    "BqsLz5rJXIFeEX91791862003595",
    "e5sgKerVG5nKbN11791862011960",
    "oxSy6RPzFQq6JIJ1791862021377",
    "pmIKRzxKrO4LZPZ1791862029733",
    "S8MXqGIeSmGwHcp1791862038154",
    "Z8EXH3c4MsncavZ1791862046525",
    "Aw9MaropRle8ydI1791862054906",
    "oYEyDI5Kkg6huag1791862063265",
    "625NYbOTUs4Kpi71791862071586",
    "JKcLKIuNQzPRFQb1791862079907",
    "5lLQs2JGDYf2pBE1791862088286",
    "UGF5feONUILbxYp1791862096612",
    "fndpIOe0zoBSVcN1791862104936",
    "9j6dsCnwNatb9b81791862113300",
    "cIMDBdZhlNU8hS81791862121718",
    "ZLftnx4y4IgqDQ61791862130060",
    "VShnhH9xYei1mEO1791862138413",
    "336Z8u9RUEERosa1791862146703",
    "ZdZWhZYwmaSf4UB1791862155104",
    "952hNNZJCF2ELrV1791862163419",
    "TFxK6vLSPEgBceV1791862171791",
    "G7kJuBZaerKutHu1791862180191",
    "OmQzzCjATd9NGmm1791862188589",
    "jeJpIdBHc3xX6KS1791862196983",
)
TAGS = (
    "cleaning",
    "childcare",
    "elderly_care",
    "electrician",
    "plumbing",
    "painter",
    "locksmith",
    "technician",
    "moving",
    "other",
)
DISTRICTS = (
    "tr-istanbul-city-kadikoy",
    "tr-istanbul-city-besiktas",
    "tr-istanbul-city-uskudar",
    "tr-istanbul-city-sisli",
    "tr-istanbul-city-atasehir",
)
COORDINATES = (
    (40.9903, 29.0294),
    (41.0430, 29.0094),
    (41.0255, 29.0153),
    (41.0602, 28.9877),
    (40.9833, 29.1278),
)
BUSINESS = {
    "cleaning": "Home Shine Cleaning",
    "childcare": "Safe Hands Childcare",
    "elderly_care": "Care Companion",
    "electrician": "Bright Electric",
    "plumbing": "Rapid Plumbing",
    "painter": "Colour Works",
    "locksmith": "Key Care Locksmith",
    "technician": "Home Tech Repair",
    "moving": "City Movers",
    "other": "Local Home Services",
}
DESCRIPTIONS = {
    "cleaning": "Reliable home cleaning, deep cleaning, and move-out services.",
    "childcare": "Experienced childcare and practical support for busy families.",
    "elderly_care": "Respectful companionship and daily assistance for older adults.",
    "electrician": "Residential electrical repairs, lighting, outlets, and safety checks.",
    "plumbing": "Leak repairs, drains, taps, toilets, and household plumbing support.",
    "painter": "Interior painting, wall preparation, touch-ups, and small renovations.",
    "locksmith": "Lock repairs, rekeying, replacement keys, and access assistance.",
    "technician": "Installation and repair support for common household appliances.",
    "moving": "Local moving, packing, furniture handling, and transport assistance.",
    "other": "Flexible local help for everyday household jobs.",
}
COMMENTS = (
    (5, "Excellent communication and careful work. Everything was finished on time."),
    (5, "Professional, friendly, and very thorough. I would book this provider again."),
    (4, "Good service and clear pricing. The result matched what we discussed."),
    (4, "Arrived on time and completed the job efficiently."),
    (3, "The work was completed as requested, with a small delay."),
    (5, "A smooth experience from the first message to completion."),
    (2, "The result was acceptable, but communication could have been clearer."),
    (4, "Helpful, well prepared, and respectful of the property."),
)


def ref(key: str) -> dict[str, str]:
    return {"ref": key}


def row(key: str, **values) -> dict:
    return {"key": key, "values": values}


def build() -> dict:
    groups: list[dict] = []
    locations = []
    for item in iter_location_seeds():
        locations.append(
            row(
                f"location:{item.code}",
                parent_id=ref(f"location:{item.parent_code}") if item.parent_code else None,
                code=item.code,
                name=item.name,
                level=item.level,
            )
        )
    groups.append({"table": "service_locations", "rows": locations})

    created = datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc)
    users = [
        row(
            "user:admin",
            name="Demo Admin",
            first_name="Demo",
            last_name="Admin",
            tos_accepted_at=created.isoformat(),
            email="demo_admin@workshop.ai",
            role="admin",
            avatar_url=None,
            is_active=True,
            is_banned=False,
            last_login_at=None,
            email_verified_at=created.isoformat(),
            phone_verified_at=created.isoformat(),
            identity_verification_status=None,
            qualification_verification_status=None,
            created_at=created.isoformat(),
        )
    ]
    for index in range(1, 6):
        users.append(
            row(
                f"user:customer:{index}",
                name=f"Demo Customer {index}",
                first_name="Demo",
                last_name=f"Customer {index}",
                tos_accepted_at=created.isoformat(),
                email=f"demo_customer_{index}@workshop.ai",
                role="customer",
                avatar_url=None,
                is_active=True,
                is_banned=False,
                last_login_at=None,
                email_verified_at=created.isoformat(),
                phone_verified_at=created.isoformat(),
                identity_verification_status=None,
                qualification_verification_status=None,
                created_at=(created + timedelta(minutes=index)).isoformat(),
            )
        )
    for index in range(1, 31):
        users.append(
            row(
                f"user:provider:{index}",
                name=f"Demo Provider {index}",
                first_name="Demo",
                last_name=f"Provider {index}",
                tos_accepted_at=created.isoformat(),
                email=f"demo_provider_{index}@workshop.ai",
                role="provider",
                avatar_url=None,
                is_active=True,
                is_banned=False,
                last_login_at=None,
                email_verified_at=created.isoformat(),
                phone_verified_at=created.isoformat(),
                identity_verification_status="approved",
                qualification_verification_status="approved",
                created_at=(created + timedelta(minutes=10 + index)).isoformat(),
            )
        )
    groups.append({"table": "users", "rows": users})

    identities = []
    for user in users:
        email = user["values"]["email"]
        identities.append(
            row(
                f"identity:{user['key']}",
                user_id=ref(user["key"]),
                identity_provider="email_password",
                provider_subject=email,
                password_hash=PASSWORD_HASH,
                created_at=created.isoformat(),
                verified_at=created.isoformat(),
            )
        )
    groups.append({"table": "authentication_identities", "rows": identities})

    customers = []
    addresses = []
    for index in range(1, 6):
        district = DISTRICTS[index - 1]
        latitude, longitude = COORDINATES[index - 1]
        street = f"{index * 12} Demo Street, Istanbul"
        customers.append(
            row(
                f"customer_profile:{index}",
                user_id=ref(f"user:customer:{index}"),
                phone_number=f"+9055500000{index:02d}",
                address=street,
                service_province="Istanbul",
                service_location_id=ref(f"location:{district}"),
                latitude=latitude,
                longitude=longitude,
                current_address=street,
                current_latitude=latitude,
                current_longitude=longitude,
                default_service_address=street,
                default_service_latitude=latitude,
                default_service_longitude=longitude,
                notes="Demonstration customer account.",
            )
        )
        addresses.append(
            row(
                f"customer_address:{index}",
                customer_id=ref(f"user:customer:{index}"),
                label="Home",
                place_id=f"demo-customer-address-{index}",
                formatted_address=street,
                latitude=latitude,
                longitude=longitude,
                service_location_id=ref(f"location:{district}"),
                is_default=True,
                created_at=created.isoformat(),
                updated_at=created.isoformat(),
            )
        )
    groups.append({"table": "customer_profiles", "rows": customers})
    groups.append({"table": "customer_addresses", "rows": addresses})

    profiles = []
    availability = []
    approved_services = []
    service_areas = []
    submerchants = []
    portfolios = []
    portfolio_media = []
    provider_tags: dict[int, tuple[str, str]] = {}
    for index in range(1, 31):
        primary = TAGS[(index - 1) % len(TAGS)]
        secondary = TAGS[(index - 1 + 5) % len(TAGS)]
        provider_tags[index] = (primary, secondary)
        latitude, longitude = (41.0082, 28.9784)
        profiles.append(
            row(
                f"provider_profile:{index}",
                user_id=ref(f"user:provider:{index}"),
                business_name=f"{BUSINESS[primary]} {index}",
                bio=DESCRIPTIONS[primary],
                phone_number=f"+9055510000{index:02d}",
                address="Istanbul, Türkiye",
                service_province="Istanbul",
                service_location_id=ref("location:tr-istanbul"),
                latitude=latitude,
                longitude=longitude,
                business_place_id=f"demo-provider-place-{index}",
                unique_enterprise_id=f"DEMO-UEI-{index:04d}",
                qualification_application_id=None,
                tags=f"{primary},{secondary}",
                certificate_name="Demonstration service credential",
                certificate_url=f"https://example.com/demo/provider-{index}-credential.pdf",
                hourly_rate=50 + ((index * 13) % 111),
                verification_status="approved",
                entity_type="personal",
                identity_verification_status="approved",
                qualification_verification_status="approved",
                verification_note="Approved demonstration provider.",
                notes="Fixed sample provider for interface demonstrations.",
            )
        )
        for weekday in range(1, 8):
            availability.append(
                row(
                    f"availability:{index}:{weekday}",
                    provider_profile_id=ref(f"provider_profile:{index}"),
                    weekday=weekday,
                    start_time="08:00",
                    end_time="20:00",
                    is_available=weekday <= 6,
                )
            )
        for tag in provider_tags[index]:
            approved_services.append(
                row(
                    f"approved_service:{index}:{tag}",
                    provider_profile_id=ref(f"provider_profile:{index}"),
                    service_category=tag,
                    is_enabled=True,
                )
            )
            image_url = f"/sample-media/service_categories/{tag}.png?v=1"
            portfolio_key = f"portfolio:{index}:{tag}"
            portfolios.append(
                row(
                    portfolio_key,
                    provider_profile_id=ref(f"provider_profile:{index}"),
                    title=f"{tag.replace('_', ' ').title()} project",
                    description=(
                        f"Completed {tag.replace('_', ' ')} work in Istanbul."
                    ),
                    image_url=image_url,
                    original_file_name=f"{tag}.png",
                    content_type="image/png",
                    media_type="image",
                    verification_status="approved",
                    verification_note="Approved fixed sample portfolio.",
                    created_at=(created + timedelta(days=index)).isoformat(),
                )
            )
            portfolio_media.append(
                row(
                    f"portfolio_media:{index}:{tag}",
                    portfolio_id=ref(portfolio_key),
                    file_url=image_url,
                    original_file_name=f"{tag}.png",
                    content_type="image/png",
                    media_type="image",
                    sort_order=0,
                    created_at=(created + timedelta(days=index)).isoformat(),
                )
            )
        service_areas.append(
            row(
                f"service_area:{index}",
                provider_profile_id=ref(f"provider_profile:{index}"),
                service_location_id=ref("location:tr-istanbul"),
            )
        )
        submerchants.append(
            row(
                f"submerchant:{index}",
                provider_profile_id=ref(f"provider_profile:{index}"),
                submerchant_type="PERSONAL",
                submerchant_external_id=f"demo-provider-{index}",
                submerchant_key=PAYOUT_SUBMERCHANT_KEYS[index - 1],
                name=f"{BUSINESS[primary]} {index}",
                email=f"demo_provider_{index}@workshop.ai",
                gsm_number=f"+9055510000{index:02d}",
                address="Istanbul, Türkiye",
                iban=PAYOUT_IBAN,
                contact_name="Demo",
                contact_surname=f"Provider {index}",
                identity_number=PAYOUT_IDENTITY_NUMBER,
                tax_office=None,
                tax_number=None,
                legal_company_title=None,
                currency="TRY",
                status="active",
                iyzico_error_code=None,
                iyzico_error_message=None,
                last_synced_at=PAYOUT_SYNCED_AT,
                created_at=created.isoformat(),
                updated_at=PAYOUT_SYNCED_AT,
            )
        )
    groups.append({"table": "provider_profiles", "rows": profiles})
    groups.append({"table": "provider_availabilities", "rows": availability})
    groups.append({"table": "provider_approved_services", "rows": approved_services})
    groups.append({"table": "provider_service_areas", "rows": service_areas})
    groups.append({"table": "provider_submerchants", "rows": submerchants})
    groups.append({"table": "provider_portfolios", "rows": portfolios})
    groups.append({"table": "provider_portfolio_media", "rows": portfolio_media})

    bookings = []
    revisions = []
    reviews = []
    base_service_time = datetime(2026, 7, 31, 8, 0, tzinfo=timezone.utc)
    for index in range(1, 301):
        provider = ((index - 1) % 30) + 1
        customer = ((index - 1) % 5) + 1
        category = provider_tags[provider][((index - 1) // 30) % 2]
        latitude, longitude = COORDINATES[(customer - 1) % len(COORDINATES)]
        scheduled_start = base_service_time - timedelta(days=index, hours=index % 5)
        scheduled_end = scheduled_start + timedelta(hours=2)
        expected = 90 + ((index * 17) % 250)
        visit_fee = 40 + ((index * 3) % 31)
        status = "completed"
        has_quote = True
        bookings.append(
            row(
                f"booking:{index}",
                customer_id=ref(f"user:customer:{customer}"),
                provider_profile_id=ref(f"provider_profile:{provider}"),
                chat_room_id=None,
                title=f"{category.replace('_', ' ').title()} service",
                service_category=category,
                service_description=f"Fixed demonstration request for {category.replace('_', ' ')}.",
                service_address=f"{customer * 12} Demo Street, Istanbul",
                service_latitude=latitude,
                service_longitude=longitude,
                customer_current_address="Istanbul current location",
                customer_current_latitude=latitude,
                customer_current_longitude=longitude,
                booking_at=(scheduled_start - timedelta(days=3)).isoformat(),
                scheduled_start_time=scheduled_start.isoformat(),
                scheduled_end_time=scheduled_end.isoformat(),
                completed_at=scheduled_end.isoformat() if status == "completed" else None,
                total_amount=str(expected + visit_fee) if has_quote else "0.00",
                quote_amount=str(expected) if has_quote else None,
                quote_message="Fixed quote for the requested service." if has_quote else None,
                expected_service_amount=str(expected) if has_quote else None,
                visit_fee_amount=str(visit_fee) if has_quote else None,
                final_quote_amount=str(expected) if status == "completed" else None,
                final_quote_message="Final amount confirmed after the visit." if status == "completed" else None,
                quoted_at=(scheduled_start - timedelta(days=2)).isoformat() if has_quote else None,
                arrival_started_at=scheduled_start.isoformat() if status == "completed" else None,
                final_quote_declined_at=None,
                final_quote_decline_reason=None,
                final_quote_confirmed_at=(scheduled_start + timedelta(minutes=45)).isoformat() if status == "completed" else None,
                closed_reason="customer_cancelled" if status == "cancelled" else None,
                status=status,
                status_note={
                    "completed": "Demonstration service completed.",
                    "pending": "Waiting for provider response.",
                    "quoted": "Provider submitted a demonstration quote.",
                    "cancelled": "Demonstration booking cancelled.",
                }[status],
                onboarding_paused=False,
                onboarding_pause_reason=None,
                onboarding_paused_at=None,
            )
        )
        if has_quote:
            revisions.append(
                row(
                    f"quote_revision:{index}",
                    booking_id=ref(f"booking:{index}"),
                    revision_number=1,
                    quote_amount=str(expected),
                    quote_message="Fixed quote for the requested service.",
                    expected_service_amount=str(expected),
                    visit_fee_amount=str(visit_fee),
                    total_amount=str(expected + visit_fee),
                    created_by_user_id=ref(f"user:provider:{provider}"),
                    declined_at=None,
                    decline_reason=None,
                    customer_confirmed_at=(scheduled_start - timedelta(days=1)).isoformat() if status == "completed" else None,
                    used_for_payment_at=None,
                    created_at=(scheduled_start - timedelta(days=2)).isoformat(),
                )
            )
        rating, comment = COMMENTS[(index - 1) % len(COMMENTS)]
        reviews.append(
            row(
                f"review:{index}",
                booking_id=ref(f"booking:{index}"),
                customer_id=ref(f"user:customer:{customer}"),
                provider_profile_id=ref(f"provider_profile:{provider}"),
                rating=rating,
                comment=comment,
                created_at=(scheduled_end + timedelta(hours=3)).isoformat(),
                is_visible=1,
                embedding_status="pending",
                embedding_error=None,
                embedding_synced_at=None,
            )
        )
    groups.append({"table": "bookings", "rows": bookings})
    groups.append({"table": "booking_quote_revisions", "rows": revisions})
    groups.append({"table": "reviews", "rows": reviews})

    return {
        "revision": "0018_workshop_samples",
        "credentials": {
            "password": PASSWORD,
            "admin": "demo_admin@workshop.ai",
            "customers": "demo_customer_1@workshop.ai ... demo_customer_5@workshop.ai",
            "providers": "demo_provider_1@workshop.ai ... demo_provider_30@workshop.ai",
        },
        "tables": groups,
    }


def main() -> None:
    snapshot = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()

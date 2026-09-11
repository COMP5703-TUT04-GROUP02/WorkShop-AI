from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException

from backend import models
from backend.routers.provider import validate_availability_override_date
from backend.utils.availability import is_provider_open_now


@pytest.fixture
def availability_provider_id(db_session):
    user = models.User(
        name="Availability Provider",
        email="availability-provider@example.com",
        role="provider",
        is_active=True,
        is_banned=False,
    )
    db_session.add(user)
    db_session.flush()

    profile = models.ProviderProfile(
        user_id=user.id,
        business_name="Availability Provider",
        bio="Provider for availability tests.",
        phone_number="+905551110000",
        address="Istanbul",
        service_province="Istanbul",
        latitude=41.0082,
        longitude=28.9784,
        service_radius_km=20,
        tags="moving",
        certificate_name="Test certificate",
        certificate_url="https://example.com/certificate.pdf",
        hourly_rate=100,
        experience_years=5,
        verification_status="approved",
    )
    db_session.add(profile)
    db_session.commit()
    return profile.id


def test_is_provider_open_now_uses_weekly_hours(db_session, availability_provider_id):
    db_session.add(
        models.ProviderAvailability(
            provider_profile_id=availability_provider_id,
            weekday=1,
            start_time="08:00",
            end_time="20:00",
            is_available=True,
        )
    )
    db_session.commit()

    monday_open = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    monday_closed = datetime(2026, 10, 5, 21, 0, tzinfo=timezone.utc)
    assert is_provider_open_now(availability_provider_id, db_session, monday_open) is True
    assert is_provider_open_now(availability_provider_id, db_session, monday_closed) is False


def test_is_provider_open_now_gives_date_override_precedence(
    db_session, availability_provider_id
):
    db_session.add(
        models.ProviderAvailability(
            provider_profile_id=availability_provider_id,
            weekday=1,
            start_time="08:00",
            end_time="20:00",
            is_available=True,
        )
    )
    db_session.add(
        models.ProviderAvailabilityOverride(
            provider_profile_id=availability_provider_id,
            override_date="2026-10-05",
            start_time="08:00",
            end_time="20:00",
            is_available=False,
        )
    )
    db_session.commit()

    monday_override = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    assert is_provider_open_now(availability_provider_id, db_session, monday_override) is False


def test_availability_override_date_validation_uses_utc(monkeypatch):
    import backend.routers.provider as provider_router

    current_utc = datetime(2026, 10, 5, 0, 30, tzinfo=timezone.utc)
    monkeypatch.setattr(provider_router, "utc_now", lambda: current_utc)

    validate_availability_override_date(date(2026, 10, 5))

    with pytest.raises(HTTPException) as exc_info:
        validate_availability_override_date(date(2026, 10, 4))
    assert exc_info.value.status_code == 400

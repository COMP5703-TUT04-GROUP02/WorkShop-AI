from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException

from backend import models
from backend.routers.provider import validate_availability_override_date
from backend.utils.availability import is_provider_open_now


def test_is_provider_open_now_uses_weekly_hours(db_session):
    db_session.add(
        models.ProviderAvailability(
            provider_profile_id=73,
            weekday=1,
            start_time="08:00",
            end_time="20:00",
            is_available=True,
        )
    )
    db_session.commit()

    monday_open = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    monday_closed = datetime(2026, 10, 5, 21, 0, tzinfo=timezone.utc)
    assert is_provider_open_now(73, db_session, monday_open) is True
    assert is_provider_open_now(73, db_session, monday_closed) is False


def test_is_provider_open_now_gives_date_override_precedence(db_session):
    db_session.add(
        models.ProviderAvailability(
            provider_profile_id=74,
            weekday=1,
            start_time="08:00",
            end_time="20:00",
            is_available=True,
        )
    )
    db_session.add(
        models.ProviderAvailabilityOverride(
            provider_profile_id=74,
            override_date="2026-10-05",
            start_time="08:00",
            end_time="20:00",
            is_available=False,
        )
    )
    db_session.commit()

    monday_override = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    assert is_provider_open_now(74, db_session, monday_override) is False


def test_availability_override_date_validation_uses_utc(monkeypatch):
    import backend.routers.provider as provider_router

    current_utc = datetime(2026, 10, 5, 0, 30, tzinfo=timezone.utc)
    monkeypatch.setattr(provider_router, "utc_now", lambda: current_utc)

    validate_availability_override_date(date(2026, 10, 5))

    with pytest.raises(HTTPException) as exc_info:
        validate_availability_override_date(date(2026, 10, 4))
    assert exc_info.value.status_code == 400

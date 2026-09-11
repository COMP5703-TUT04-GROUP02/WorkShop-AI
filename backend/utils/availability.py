from datetime import date, datetime, time, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend import models
from backend.schemas import ProviderAvailabilityOverrideUpdate
from backend.core.clock import utc_now


def format_time_value(value: time | None):
    if value is None:
        return "00:00"

    return value.strftime("%H:%M")


def parse_time_value(value: str):
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def format_provider_availability_response(availability: models.ProviderAvailability):
    return {
        "id": availability.id,
        "provider_profile_id": availability.provider_profile_id,
        "weekday": availability.weekday,
        "start_time": availability.start_time,
        "end_time": availability.end_time,
        "is_available": availability.is_available,
    }


def format_provider_availability_override_response(
    availability_override: models.ProviderAvailabilityOverride,
):
    return {
        "id": availability_override.id,
        "provider_profile_id": availability_override.provider_profile_id,
        "override_date": availability_override.override_date,
        "start_time": availability_override.start_time,
        "end_time": availability_override.end_time,
        "is_available": availability_override.is_available,
        "created_at": availability_override.created_at,
        "updated_at": availability_override.updated_at,
    }


def get_provider_availabilities(provider_profile_id: int, db: Session):
    return (
        db.query(models.ProviderAvailability)
        .filter(models.ProviderAvailability.provider_profile_id == provider_profile_id)
        .order_by(models.ProviderAvailability.weekday.asc())
        .all()
    )


def replace_provider_availabilities(
    provider_profile_id: int,
    availability_items: list,
    db: Session,
):
    db.query(models.ProviderAvailability).filter(
        models.ProviderAvailability.provider_profile_id == provider_profile_id
    ).delete(synchronize_session=False)

    availabilities = []

    for item in availability_items:
        if not item.is_available:
            continue

        availability = models.ProviderAvailability(
            provider_profile_id=provider_profile_id,
            weekday=item.weekday,
            start_time=format_time_value(item.start_time),
            end_time=format_time_value(item.end_time),
            is_available=True,
        )
        db.add(availability)
        availabilities.append(availability)

    db.commit()

    for availability in availabilities:
        db.refresh(availability)

    return availabilities


def get_provider_availability_overrides_by_month(
    provider_profile_id: int,
    month: str,
    db: Session,
):
    return (
        db.query(models.ProviderAvailabilityOverride)
        .filter(
            models.ProviderAvailabilityOverride.provider_profile_id
            == provider_profile_id,
            models.ProviderAvailabilityOverride.override_date.like(f"{month}-%"),
        )
        .order_by(models.ProviderAvailabilityOverride.override_date.asc())
        .all()
    )


def get_provider_availability_override_by_date(
    provider_profile_id: int,
    override_date: date,
    db: Session,
):
    return (
        db.query(models.ProviderAvailabilityOverride)
        .filter(
            models.ProviderAvailabilityOverride.provider_profile_id
            == provider_profile_id,
            models.ProviderAvailabilityOverride.override_date
            == override_date.isoformat(),
        )
        .first()
    )


def upsert_provider_availability_override(
    provider_profile_id: int,
    override_date: date,
    override_data: ProviderAvailabilityOverrideUpdate,
    db: Session,
):
    now = utc_now()
    availability_override = get_provider_availability_override_by_date(
        provider_profile_id,
        override_date,
        db,
    )

    if availability_override is None:
        availability_override = models.ProviderAvailabilityOverride(
            provider_profile_id=provider_profile_id,
            override_date=override_date.isoformat(),
            start_time=format_time_value(override_data.start_time),
            end_time=format_time_value(override_data.end_time),
            is_available=override_data.is_available,
            created_at=now,
            updated_at=now,
        )
        db.add(availability_override)
    else:
        availability_override.start_time = format_time_value(override_data.start_time)
        availability_override.end_time = format_time_value(override_data.end_time)
        availability_override.is_available = override_data.is_available
        availability_override.updated_at = now

    db.commit()
    db.refresh(availability_override)

    return availability_override


def delete_provider_availability_override(
    provider_profile_id: int,
    override_date: date,
    db: Session,
):
    availability_override = get_provider_availability_override_by_date(
        provider_profile_id,
        override_date,
        db,
    )

    if availability_override is None:
        raise HTTPException(status_code=404, detail="Availability override not found")

    db.delete(availability_override)
    db.commit()


def is_same_day_time_range(start_datetime: datetime, end_datetime: datetime):
    return start_datetime.date() == end_datetime.date()


def is_provider_open_now(
    provider_profile_id: int,
    db: Session,
    now: datetime | None = None,
):
    """Return whether a provider is currently within their published hours.

    Availability timestamps are stored without a timezone, so the API uses UTC
    consistently when comparing the current time. A date override takes
    precedence over the weekly schedule, including an explicit unavailable
    override.
    """
    current = now or utc_now()
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    else:
        current = current.astimezone(timezone.utc)

    current_time = current.time().replace(second=0, microsecond=0)
    availability_override = get_provider_availability_override_by_date(
        provider_profile_id,
        current.date(),
        db,
    )

    if availability_override is not None:
        if not availability_override.is_available:
            return False

        return (
            parse_time_value(availability_override.start_time)
            <= current_time
            <= parse_time_value(availability_override.end_time)
        )

    availabilities = (
        db.query(models.ProviderAvailability)
        .filter(
            models.ProviderAvailability.provider_profile_id == provider_profile_id,
            models.ProviderAvailability.weekday == current.isoweekday(),
            models.ProviderAvailability.is_available.is_(True),
        )
        .all()
    )

    return any(
        parse_time_value(availability.start_time)
        <= current_time
        <= parse_time_value(availability.end_time)
        for availability in availabilities
    )


def is_provider_available_for_datetime_range(
    provider_profile_id: int,
    start_datetime: datetime,
    end_datetime: datetime,
    db: Session,
):
    return (
        get_provider_unavailability_reason(
            provider_profile_id,
            start_datetime,
            end_datetime,
            db,
        )
        is None
    )


def get_provider_unavailability_reason(
    provider_profile_id: int,
    start_datetime: datetime,
    end_datetime: datetime,
    db: Session,
):
    if not is_same_day_time_range(start_datetime, end_datetime):
        return "Appointment must be on the same day; overnight bookings are not supported"

    weekday = start_datetime.isoweekday()
    start_time = start_datetime.time().replace(second=0, microsecond=0)
    end_time = end_datetime.time().replace(second=0, microsecond=0)
    date_text = start_datetime.date().isoformat()
    requested_time_text = f"{format_time_value(start_time)}-{format_time_value(end_time)}"
    availability_override = get_provider_availability_override_by_date(
        provider_profile_id,
        start_datetime.date(),
        db,
    )

    if availability_override is not None:
        if not availability_override.is_available:
            return f"Provider is unavailable on {date_text}; cannot create booking"

        override_start_time = parse_time_value(availability_override.start_time)
        override_end_time = parse_time_value(availability_override.end_time)
        override_time_text = (
            f"{availability_override.start_time}-{availability_override.end_time}"
        )

        if override_start_time <= start_time and end_time <= override_end_time:
            return None

        return (
            f"Requested time {requested_time_text} is outside provider daily hours on {date_text} ({override_time_text})"
        )

    availabilities = (
        db.query(models.ProviderAvailability)
        .filter(
            models.ProviderAvailability.provider_profile_id == provider_profile_id,
            models.ProviderAvailability.weekday == weekday,
            models.ProviderAvailability.is_available.is_(True),
        )
        .all()
    )

    if not availabilities:
        return (
            f"Provider has no default hours on {format_weekday_label(weekday)} and no day override; cannot create booking"
        )

    for availability in availabilities:
        available_start_time = parse_time_value(availability.start_time)
        available_end_time = parse_time_value(availability.end_time)

        if available_start_time <= start_time and end_time <= available_end_time:
            return None

    available_time_text = ", ".join(
        f"{availability.start_time}-{availability.end_time}"
        for availability in availabilities
    )
    return (
        f"Requested time {requested_time_text} is outside default hours on {format_weekday_label(weekday)} ({available_time_text})"
    )


def ensure_provider_available_for_datetime_range(
    provider_profile_id: int,
    start_datetime: datetime,
    end_datetime: datetime,
    db: Session,
):
    unavailable_reason = get_provider_unavailability_reason(
        provider_profile_id,
        start_datetime,
        end_datetime,
        db,
    )

    if unavailable_reason is not None:
        raise HTTPException(
            status_code=400,
            detail=unavailable_reason,
        )


def format_weekday_label(weekday: int):
    labels = {
        1: "Monday",
        2: "Tuesday",
        3: "Wednesday",
        4: "Thursday",
        5: "Friday",
        6: "Saturday",
        7: "Sunday",
    }

    return labels.get(weekday, f"Day {weekday}")

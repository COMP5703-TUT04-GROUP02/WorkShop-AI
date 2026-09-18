from datetime import datetime
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from backend.core.clock import to_workshop_datetime
from backend.schemas.booking import BookingCreate, BookingUpdate
from backend.utils.upload import validate_booking_attachments


def upload(filename: str, content_type: str, size: int = 1) -> UploadFile:
    return UploadFile(
        file=BytesIO(b"x" * size),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def test_booking_title_is_required_and_limited_to_30_words():
    with pytest.raises(ValueError):
        BookingCreate(
            provider_profile_id=1,
            title=" ".join(["word"] * 31),
            service_description="Repair",
            service_address="Address",
            service_latitude=41,
            service_longitude=29,
            scheduled_start_time=datetime(2026, 10, 5, 10),
            scheduled_end_time=datetime(2026, 10, 5, 11),
        )
    with pytest.raises(ValueError):
        BookingUpdate(
            title="",
            service_description="Repair",
            service_address="Address",
            service_latitude=41,
            service_longitude=29,
            scheduled_start_time=datetime(2026, 10, 5, 10),
            scheduled_end_time=datetime(2026, 10, 5, 11),
        )


def test_booking_attachment_limits_are_checked_before_persistence():
    with pytest.raises(HTTPException) as too_many_images:
        validate_booking_attachments([upload(f"{index}.jpg", "image/jpeg") for index in range(6)])
    assert too_many_images.value.status_code == 422

    with pytest.raises(HTTPException) as too_many_videos:
        validate_booking_attachments([upload(f"{index}.mp4", "video/mp4") for index in range(3)])
    assert too_many_videos.value.status_code == 422

    with pytest.raises(HTTPException) as oversized_image:
        validate_booking_attachments([upload("large.jpg", "image/jpeg", 2 * 1024 * 1024 + 1)])
    assert oversized_image.value.status_code == 422

    with pytest.raises(HTTPException) as oversized_video:
        validate_booking_attachments([upload("large.mp4", "video/mp4", 10 * 1024 * 1024 + 1)])
    assert oversized_video.value.status_code == 422


def test_booking_create_and_update_time_contract_normalizes_naive_and_aware_inputs():
    naive = to_workshop_datetime(datetime(2026, 10, 5, 10))
    aware = to_workshop_datetime(datetime.fromisoformat("2026-10-05T07:00:00+00:00"))
    assert naive.isoformat() == "2026-10-05T10:00:00+03:00"
    assert aware.isoformat() == "2026-10-05T10:00:00+03:00"

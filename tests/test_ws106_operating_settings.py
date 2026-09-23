import pytest

from backend import models
from backend.utils.service_locations import seed_service_locations
from tests.conftest import create_provider_profile, register_session


@pytest.fixture(autouse=True)
def isolate_online_status(monkeypatch):
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)


def provider_with_profile(client, db_session, *, email="ws106-provider@example.com"):
    provider = register_session(client, email, role="provider", name="Settings Provider")
    profile_data = create_provider_profile(client, provider["headers"])
    profile = db_session.query(models.ProviderProfile).filter_by(id=profile_data["id"]).one()
    return provider, profile


def approve_qualification(db_session, profile):
    profile.identity_verification_status = "approved"
    profile.qualification_verification_status = "approved"
    profile.verification_status = "approved"
    db_session.commit()


@pytest.mark.parametrize("qualification_status", ["pending", "rejected"])
def test_operating_settings_requires_approved_qualification(
    client, db_session, qualification_status
):
    provider, profile = provider_with_profile(
        client,
        db_session,
        email=f"ws106-{qualification_status}@example.com",
    )
    original = (profile.hourly_rate, profile.service_radius_km, profile.service_location_id)
    profile.qualification_verification_status = qualification_status
    db_session.commit()

    response = client.patch(
        "/provider/profile/operating-settings",
        json={"hourly_rate": 525},
        headers=provider["headers"],
    )

    assert response.status_code == 403
    db_session.refresh(profile)
    assert (profile.hourly_rate, profile.service_radius_km, profile.service_location_id) == original


def test_operating_settings_supports_independent_rate_and_radius_updates(client, db_session):
    provider, profile = provider_with_profile(client, db_session)
    approve_qualification(db_session, profile)
    statuses_before = (
        profile.identity_verification_status,
        profile.qualification_verification_status,
        profile.verification_status,
    )

    rate_response = client.patch(
        "/provider/profile/operating-settings",
        json={"hourly_rate": 525},
        headers=provider["headers"],
    )
    assert rate_response.status_code == 200, rate_response.text
    assert rate_response.json()["data"]["profile"]["hourly_rate"] == 525
    assert rate_response.json()["data"]["profile"]["service_radius_km"] == 15
    assert (
        rate_response.json()["data"]["profile"]["identity_verification_status"],
        rate_response.json()["data"]["profile"]["qualification_verification_status"],
        rate_response.json()["data"]["profile"]["verification_status"],
    ) == statuses_before

    radius_response = client.patch(
        "/provider/profile/operating-settings",
        json={"service_radius_km": 32.5},
        headers=provider["headers"],
    )
    assert radius_response.status_code == 200, radius_response.text
    assert radius_response.json()["data"]["profile"]["hourly_rate"] == 525
    assert radius_response.json()["data"]["profile"]["service_radius_km"] == 32.5
    assert (
        radius_response.json()["data"]["profile"]["identity_verification_status"],
        radius_response.json()["data"]["profile"]["qualification_verification_status"],
        radius_response.json()["data"]["profile"]["verification_status"],
    ) == statuses_before


def test_invalid_location_combination_does_not_partially_update_rate_or_radius(client, db_session):
    provider, profile = provider_with_profile(client, db_session)
    approve_qualification(db_session, profile)
    original = (profile.hourly_rate, profile.service_radius_km, profile.service_location_id)

    response = client.patch(
        "/provider/profile/operating-settings",
        json={
            "hourly_rate": original[0] + 100,
            "service_radius_km": original[1] + 10,
            "service_location_id": 999999,
        },
        headers=provider["headers"],
    )

    assert response.status_code == 404
    db_session.refresh(profile)
    assert (profile.hourly_rate, profile.service_radius_km, profile.service_location_id) == original


def test_operating_settings_updates_district_and_combined_values_without_review_reset(
    client, db_session
):
    seeded = seed_service_locations(db_session)
    db_session.commit()
    district = seeded["tr-istanbul-city-kadikoy"]
    provider, profile = provider_with_profile(client, db_session)
    approve_qualification(db_session, profile)
    statuses_before = (
        profile.identity_verification_status,
        profile.qualification_verification_status,
        profile.verification_status,
    )

    response = client.patch(
        "/provider/profile/operating-settings",
        json={
            "hourly_rate": 610,
            "service_radius_km": 24,
            "service_location_id": district.id,
        },
        headers=provider["headers"],
    )

    assert response.status_code == 200, response.text
    result = response.json()["data"]["profile"]
    assert result["hourly_rate"] == 610
    assert result["service_radius_km"] == 24
    assert result["service_location_id"] == district.id
    assert result["service_province"] == "Istanbul"
    assert (
        result["identity_verification_status"],
        result["qualification_verification_status"],
        result["verification_status"],
    ) == statuses_before


@pytest.mark.parametrize("location_kind", ["missing", "province", "city"])
def test_operating_settings_rejects_invalid_location_levels(client, db_session, location_kind):
    seeded = seed_service_locations(db_session)
    db_session.commit()
    provider, profile = provider_with_profile(
        client,
        db_session,
        email=f"ws106-{location_kind}@example.com",
    )
    approve_qualification(db_session, profile)
    location_ids = {
        "missing": 999999,
        "province": seeded["tr-istanbul"].id,
        "city": seeded["tr-istanbul-city"].id,
    }

    response = client.patch(
        "/provider/profile/operating-settings",
        json={"service_location_id": location_ids[location_kind]},
        headers=provider["headers"],
    )

    assert response.status_code == (404 if location_kind == "missing" else 400)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"hourly_rate": 0},
        {"service_radius_km": -1},
        {"service_location_id": 0},
        {"hourly_rate": None},
    ],
)
def test_operating_settings_rejects_empty_or_invalid_payload(client, db_session, payload):
    provider, profile = provider_with_profile(
        client,
        db_session,
        email=f"ws106-invalid-{len(str(payload))}@example.com",
    )
    approve_qualification(db_session, profile)

    response = client.patch(
        "/provider/profile/operating-settings",
        json=payload,
        headers=provider["headers"],
    )

    assert response.status_code == 422


def test_operating_settings_rejects_non_provider(client):
    customer = register_session(client, "ws106-customer@example.com")

    response = client.patch(
        "/provider/profile/operating-settings",
        json={"hourly_rate": 500},
        headers=customer["headers"],
    )

    assert response.status_code == 403


def test_operating_settings_is_published_in_openapi(client):
    document = client.get("/openapi.json")

    assert document.status_code == 200
    assert "patch" in document.json()["paths"]["/provider/profile/operating-settings"]

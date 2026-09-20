from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.schemas.provider import ProviderProfileCreate
from backend.utils.provider import require_provider_qualification_approved
from tests.conftest import create_admin_session, create_provider_profile, register_session


def test_provider_entity_type_is_constrained():
    with pytest.raises(ValueError):
        ProviderProfileCreate(entity_type="both", business_name="x", bio="x", service_province="x", tags=["cleaning"], certificate_name="x", certificate_url="x", hourly_rate=1, experience_years=0)


def test_provider_qualification_gate_is_independent_from_identity():
    profile = SimpleNamespace(
        identity_verification_status="approved",
        qualification_verification_status="pending",
        verification_status="pending",
    )
    with pytest.raises(HTTPException) as error:
        require_provider_qualification_approved(profile)
    assert error.value.status_code == 403


def test_approved_qualification_unlocks_gate():
    profile = SimpleNamespace(
        identity_verification_status="approved",
        qualification_verification_status="approved",
        verification_status="approved",
    )
    require_provider_qualification_approved(profile)


def test_admin_reviews_identity_then_qualification_independently(client, db_session, monkeypatch):
    monkeypatch.setattr("backend.routers.admin.create_notification", lambda *args, **kwargs: None)
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)
    provider = register_session(client, "ws104-provider@example.com", role="provider", name="WS Provider")
    admin = create_admin_session(client, db_session, email="ws104-admin@example.com")
    profile = create_provider_profile(client, provider["headers"])
    no_step = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "legacy"},
        headers=admin["headers"],
    )
    assert no_step.status_code == 422
    qualification_first = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "not yet", "verification_step": "qualification"},
        headers=admin["headers"],
    )
    assert qualification_first.status_code == 400
    identity = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "identity", "verification_step": "identity"},
        headers=admin["headers"],
    )
    assert identity.status_code == 200
    qualification = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "qualification", "verification_step": "qualification"},
        headers=admin["headers"],
    )
    assert qualification.status_code == 200
    history = client.get(
        f"/admin/providers/{profile['id']}/verification-history",
        headers=admin["headers"],
    )
    rows = history.json()["data"]["items"]
    assert [(row["verification_step"], row["new_status"]) for row in rows[-2:]] == [
        ("identity", "approved"),
        ("qualification", "approved"),
    ]


def test_invalid_entity_type_is_rejected_by_real_route(client):
    provider = register_session(client, "ws104-invalid@example.com", role="provider", name="Invalid Provider")
    payload = {
        "entity_type": "both", "business_name": "x", "bio": "x", "service_province": "Istanbul",
        "tags": ["plumbing"], "certificate_name": "x", "certificate_url": "https://example.com/x",
        "hourly_rate": 1, "experience_years": 0,
    }
    response = client.post("/provider/profile", json=payload, headers=provider["headers"])
    assert response.status_code == 422


def test_identity_gate_allows_certificate_but_qualification_gate_locks_schedule(client, db_session, monkeypatch):
    monkeypatch.setattr("backend.routers.admin.create_notification", lambda *args, **kwargs: None)
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)
    provider = register_session(client, "ws104-gates@example.com", role="provider", name="Gate Provider")
    admin = create_admin_session(client, db_session, email="ws104-gates-admin@example.com")
    profile = create_provider_profile(client, provider["headers"])
    blocked = client.get("/provider/availability", headers=provider["headers"])
    assert blocked.status_code == 403
    identity = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "identity", "verification_step": "identity"},
        headers=admin["headers"],
    )
    assert identity.status_code == 200
    upload = client.post(
        "/provider/certificates/upload",
        files={"file": ("proof.pdf", b"proof", "application/pdf")},
        headers=provider["headers"],
    )
    assert upload.status_code != 403
    still_blocked = client.get("/provider/availability", headers=provider["headers"])
    assert still_blocked.status_code == 403
    qualification = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "qualification", "verification_step": "qualification"},
        headers=admin["headers"],
    )
    assert qualification.status_code == 200
    unlocked = client.get("/provider/availability", headers=provider["headers"])
    assert unlocked.status_code == 200

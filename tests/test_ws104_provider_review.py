from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend import models
from backend.schemas.provider import ProviderProfileCreate
from backend.utils.provider import require_provider_qualification_approved
from tests.conftest import create_admin_session, create_provider_profile, register_session


def full_profile_payload(profile, **updates):
    payload = {
        "entity_type": profile.get("entity_type", "personal"),
        "business_name": profile["business_name"],
        "bio": profile["bio"],
        "phone_number": profile["phone_number"],
        "address": profile["address"],
        "service_province": profile["service_province"],
        "latitude": profile["latitude"],
        "longitude": profile["longitude"],
        "service_radius_km": profile["service_radius_km"],
        "tags": profile["tags"],
        "certificate_name": profile["certificate_name"],
        "certificate_url": profile["certificate_url"],
        "hourly_rate": profile["hourly_rate"],
        "experience_years": profile["experience_years"],
    }
    payload.update(updates)
    return payload


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


def test_legacy_admin_review_updates_all_statuses(client, db_session, monkeypatch):
    monkeypatch.setattr("backend.routers.admin.create_notification", lambda *args, **kwargs: None)
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)
    provider = register_session(client, "ws104-legacy@example.com", role="provider", name="Legacy Provider")
    admin = create_admin_session(client, db_session, email="ws104-legacy-admin@example.com")
    profile = create_provider_profile(client, provider["headers"])
    approved = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "legacy approve"},
        headers=admin["headers"],
    )
    assert approved.status_code == 200
    approved_profile = approved.json()["data"]["profile"]
    assert approved_profile["identity_verification_status"] == "approved"
    assert approved_profile["qualification_verification_status"] == "approved"
    assert approved_profile["verification_status"] == "approved"
    visible = client.get("/providers")
    assert visible.status_code == 200
    assert profile["id"] in [item["id"] for item in visible.json()["data"]["items"]]
    rejected = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "rejected", "verification_note": "legacy reject"},
        headers=admin["headers"],
    )
    assert rejected.status_code == 200
    rejected_profile = rejected.json()["data"]["profile"]
    assert rejected_profile["identity_verification_status"] == "rejected"
    assert rejected_profile["qualification_verification_status"] == "rejected"
    assert rejected_profile["verification_status"] == "rejected"
    hidden = client.get("/providers")
    assert hidden.status_code == 200
    assert profile["id"] not in [item["id"] for item in hidden.json()["data"]["items"]]


def test_identity_rejection_revokes_market_access_and_profile_update_resubmits(client, db_session, monkeypatch):
    monkeypatch.setattr("backend.routers.admin.create_notification", lambda *args, **kwargs: None)
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)
    provider = register_session(client, "ws104-resubmit@example.com", role="provider", name="Retry Provider")
    admin = create_admin_session(client, db_session, email="ws104-resubmit-admin@example.com")
    profile = create_provider_profile(client, provider["headers"])
    legacy_approve = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "initial approval"},
        headers=admin["headers"],
    )
    assert legacy_approve.status_code == 200
    rejected = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "rejected", "verification_note": "identity mismatch", "verification_step": "identity"},
        headers=admin["headers"],
    )
    assert rejected.status_code == 200
    rejected_profile = rejected.json()["data"]["profile"]
    assert rejected_profile["identity_verification_status"] == "rejected"
    assert rejected_profile["qualification_verification_status"] == "rejected"
    assert rejected_profile["verification_status"] == "rejected"
    public = client.get("/providers")
    assert profile["id"] not in [item["id"] for item in public.json()["data"]["items"]]
    update_payload = {
        "entity_type": "organisation",
        "business_name": "Corrected Business",
        "bio": profile["bio"],
        "phone_number": profile["phone_number"],
        "address": profile["address"],
        "service_province": profile["service_province"],
        "latitude": profile["latitude"],
        "longitude": profile["longitude"],
        "service_radius_km": profile["service_radius_km"],
        "tags": profile["tags"],
        "certificate_name": profile["certificate_name"],
        "certificate_url": profile["certificate_url"],
        "hourly_rate": profile["hourly_rate"],
        "experience_years": profile["experience_years"],
    }
    resubmitted = client.put("/provider/profile", json=update_payload, headers=provider["headers"])
    assert resubmitted.status_code == 200, resubmitted.text
    resubmitted_profile = resubmitted.json()["data"]["profile"]
    assert resubmitted_profile["identity_verification_status"] == "pending"
    assert resubmitted_profile["qualification_verification_status"] == "pending"
    assert resubmitted_profile["verification_status"] == "pending"
    history = client.get(
        f"/admin/providers/{profile['id']}/verification-history", headers=admin["headers"]
    ).json()["data"]["items"]
    assert history[-1]["verification_step"] == "identity"
    assert history[-1]["old_status"] == "rejected"
    assert history[-1]["new_status"] == "pending"


def test_changing_approved_entity_type_requires_new_identity_review(client, db_session, monkeypatch):
    monkeypatch.setattr("backend.routers.admin.create_notification", lambda *args, **kwargs: None)
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)
    provider = register_session(client, "ws104-entity@example.com", role="provider", name="Entity Provider")
    admin = create_admin_session(client, db_session, email="ws104-entity-admin@example.com")
    profile = create_provider_profile(client, provider["headers"])
    approved = client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "legacy approve"},
        headers=admin["headers"],
    )
    assert approved.status_code == 200
    payload = {
        "entity_type": "organisation", "business_name": profile["business_name"], "bio": profile["bio"],
        "phone_number": profile["phone_number"], "address": profile["address"],
        "service_province": profile["service_province"], "latitude": profile["latitude"],
        "longitude": profile["longitude"], "service_radius_km": profile["service_radius_km"],
        "tags": profile["tags"], "certificate_name": profile["certificate_name"],
        "certificate_url": profile["certificate_url"], "hourly_rate": profile["hourly_rate"],
        "experience_years": profile["experience_years"],
    }
    updated = client.put("/provider/profile", json=payload, headers=provider["headers"])
    assert updated.status_code == 200, updated.text
    result = updated.json()["data"]["profile"]
    assert result["identity_verification_status"] == "pending"
    assert result["qualification_verification_status"] == "pending"
    assert result["verification_status"] == "pending"


def test_certificate_change_resets_only_qualification(client, db_session, monkeypatch):
    monkeypatch.setattr("backend.routers.admin.create_notification", lambda *args, **kwargs: None)
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)
    provider = register_session(client, "ws104-cert-change@example.com", role="provider", name="Cert Provider")
    admin = create_admin_session(client, db_session, email="ws104-cert-admin@example.com")
    profile = create_provider_profile(client, provider["headers"])
    assert client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "legacy approve"},
        headers=admin["headers"],
    ).status_code == 200
    payload = full_profile_payload(
        profile,
        certificate_name="Updated qualification",
        certificate_url="https://example.com/updated-cert.pdf",
        certificate_files=[
            {
                "file_url": "https://example.com/new-proof.pdf",
                "original_file_name": "new-proof.pdf",
                "content_type": "application/pdf",
                "media_type": "document",
            }
        ],
    )
    updated = client.put("/provider/profile", json=payload, headers=provider["headers"])
    assert updated.status_code == 200, updated.text
    result = updated.json()["data"]["profile"]
    assert result["identity_verification_status"] == "approved"
    assert result["qualification_verification_status"] == "pending"
    assert result["verification_status"] == "pending"
    history = client.get(
        f"/admin/providers/{profile['id']}/verification-history", headers=admin["headers"]
    ).json()["data"]["items"]
    assert history[-1]["verification_step"] == "qualification"


def test_bio_rate_update_without_certificate_round_trip_preserves_files_and_identity(client, db_session, monkeypatch):
    monkeypatch.setattr("backend.routers.admin.create_notification", lambda *args, **kwargs: None)
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)
    provider = register_session(client, "ws104-bio-rate@example.com", role="provider", name="Bio Provider")
    admin = create_admin_session(client, db_session, email="ws104-bio-admin@example.com")
    profile = create_provider_profile(client, provider["headers"])
    db_session.add(
        models.ProviderCertificateFile(
            provider_profile_id=profile["id"], file_url="https://example.com/existing.pdf",
            original_file_name="existing.pdf", content_type="application/pdf", media_type="document",
        )
    )
    db_session.commit()
    assert client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "legacy approve"},
        headers=admin["headers"],
    ).status_code == 200
    payload = full_profile_payload(profile, bio="Updated bio", hourly_rate=777)
    assert "certificate_files" not in payload
    updated = client.put("/provider/profile", json=payload, headers=provider["headers"])
    assert updated.status_code == 200, updated.text
    result = updated.json()["data"]["profile"]
    assert result["identity_verification_status"] == "approved"
    assert result["qualification_verification_status"] == "pending"
    assert len(result["certificate_files"]) == 1
    assert result["certificate_files"][0]["file_url"] == "https://example.com/existing.pdf"


def test_full_and_contact_updates_keep_phone_address_out_of_identity_review(client, db_session, monkeypatch):
    monkeypatch.setattr("backend.routers.admin.create_notification", lambda *args, **kwargs: None)
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)
    provider = register_session(client, "ws104-contact@example.com", role="provider", name="Contact Provider")
    admin = create_admin_session(client, db_session, email="ws104-contact-admin@example.com")
    profile = create_provider_profile(client, provider["headers"])
    assert client.put(
        f"/admin/providers/{profile['id']}/verification",
        json={"verification_status": "approved", "verification_note": "legacy approve"},
        headers=admin["headers"],
    ).status_code == 200
    full = client.put(
        "/provider/profile",
        json=full_profile_payload(profile, phone_number="+905551110001", address="Updated address"),
        headers=provider["headers"],
    )
    assert full.status_code == 200, full.text
    assert full.json()["data"]["profile"]["identity_verification_status"] == "approved"
    contact_put = client.put(
        "/provider/profile/contact",
        json={
            "phone_number": "+905551110002", "address": "PUT address",
            "service_province": profile["service_province"],
        },
        headers=provider["headers"],
    )
    assert contact_put.status_code == 200, contact_put.text
    assert contact_put.json()["data"]["profile"]["identity_verification_status"] == "approved"
    contact_patch = client.patch(
        "/provider/profile/contact",
        json={"address": "PATCH address"},
        headers=provider["headers"],
    )
    assert contact_patch.status_code == 200, contact_patch.text
    assert contact_patch.json()["data"]["profile"]["identity_verification_status"] == "approved"

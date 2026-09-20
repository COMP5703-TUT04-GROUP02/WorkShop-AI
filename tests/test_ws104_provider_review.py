from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.schemas.provider import ProviderProfileCreate
from backend.utils.provider import require_provider_qualification_approved


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

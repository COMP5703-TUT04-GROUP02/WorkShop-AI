import os
from datetime import datetime, timezone

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from backend.constants import DEMO_PASSWORD


def _rsa_pem_pair() -> tuple[str, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return private_pem, public_pem


_private, _public = _rsa_pem_pair()
os.environ["WORKSHOP_JWT_ALGORITHM"] = "RS256"
os.environ["WORKSHOP_JWT_PRIVATE_KEY"] = _private
os.environ["WORKSHOP_JWT_PUBLIC_KEY"] = _public
os.environ.setdefault("WORKSHOP_DATABASE_URL", "sqlite://")
# Tests must not call a live vendor. Empty values also block dotenv from filling keys.
for _llm_key in (
    "QWEN_API_KEY",
    "DASHSCOPE_API_KEY",
    "OPENAI_API_KEY",
    "LLM_API_KEY",
    "EMBEDDING_API_KEY",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "KIMI_API_KEY",
    "MOONSHOT_API_KEY",
    "KIMI_CODE_API_KEY",
    "DEEPSEEK_API_KEY",
    "XAI_API_KEY",
    "GROK_API_KEY",
):
    os.environ[_llm_key] = ""

from fastapi.testclient import TestClient
import pytest

from backend.database import Base, SessionLocal, engine
from backend.main import app
from backend import models  # noqa: F401

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

BOOKING_START = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
BOOKING_END = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)


class FakeIyzicoClient:
    def __init__(self):
        self.sessions: dict[str, dict] = {}
        self.retrieve_amount_override: str | None = None

    async def initialize_checkout_form(self, payload: dict) -> dict:
        token = f"test-token-{len(self.sessions) + 1}"
        self.sessions[token] = payload
        return {
            "status": "success",
            "conversationId": payload["conversationId"],
            "token": token,
            "paymentPageUrl": f"https://sandbox.example.test/checkout/{token}",
        }

    async def retrieve_checkout_form(
        self,
        *,
        token: str,
        conversation_id: str | None = None,
    ) -> dict:
        payload = self.sessions[token]
        amount = self.retrieve_amount_override or str(payload["paidPrice"])
        return {
            "status": "success",
            "paymentStatus": "SUCCESS",
            "conversationId": conversation_id or payload["conversationId"],
            "paymentId": f"iyzico-payment-{token}",
            "price": amount,
            "paidPrice": amount,
            "currency": payload["currency"],
            "itemTransactions": [
                {
                    "paymentTransactionId": f"iyzico-transaction-{token}",
                    "transactionStatus": 1,
                }
            ],
        }


@pytest.fixture
def db_session():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    return TestClient(app)


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def register(client, email="customer@example.com", password=DEMO_PASSWORD, role="customer", name="Test User"):
    first_name, last_name = name.split(" ", 1)
    return client.post(
        "/register",
        json={
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "password": password,
            "confirm_password": password,
            "tos_accepted": True,
            "role": role,
        },
    )


def login(client, email="customer@example.com", password=DEMO_PASSWORD):
    return client.post(
        "/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


def register_session(client, email, role="customer", name="Test User"):
    created = register(client, email=email, role=role, name=name)
    assert created.status_code == 200, created.text
    session = login(client, email=email)
    assert session.status_code == 200, session.text
    data = session.json()["data"]
    return {
        "user": created.json()["data"]["user"],
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "headers": auth_header(data["access_token"]),
    }


def create_admin_session(client, db_session, email="admin@example.com", name="Ada Admin"):
    from backend.auth import create_password_identity
    from backend.core.clock import utc_now

    user = models.User(
        name=name,
        email=email,
        role="admin",
        is_active=True,
        is_banned=False,
        last_login_at=None,
        created_at=utc_now(),
    )
    db_session.add(user)
    db_session.flush()
    create_password_identity(user, DEMO_PASSWORD, db_session, verified=True)
    db_session.commit()
    db_session.refresh(user)

    session = login(client, email=email)
    assert session.status_code == 200, session.text
    data = session.json()["data"]
    return {
        "user": {"id": user.id, "email": user.email, "role": user.role, "name": user.name},
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "headers": auth_header(data["access_token"]),
    }


@pytest.fixture
def fake_iyzico(monkeypatch):
    fake = FakeIyzicoClient()
    monkeypatch.setattr(
        "backend.services.iyzico.get_iyzico_client",
        lambda: fake,
    )
    return fake


def create_provider_profile(client, headers):
    current_user = client.get("/me", headers=headers)
    assert current_user.status_code == 200, current_user.text
    user_id = current_user.json()["data"]["id"]
    db = SessionLocal()
    try:
        profile = models.ProviderProfile(
            user_id=user_id,
            business_name="Bosphorus Plumbing",
            bio="Istanbul kitchen and bathroom repairs.",
            phone_number="+905551110000",
            address="Karakoy, Istanbul",
            service_province="Istanbul",
            latitude=41.0255,
            longitude=28.9744,
            tags="plumbing",
            certificate_name="Trade license",
            certificate_url="https://example.com/cert.pdf",
            hourly_rate=400,
            verification_status="pending",
            identity_verification_status="pending",
            qualification_verification_status="pending",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return {
            "id": profile.id,
            "user_id": profile.user_id,
            "business_name": profile.business_name,
            "bio": profile.bio,
            "phone_number": profile.phone_number,
            "address": profile.address,
            "service_province": profile.service_province,
            "service_location_id": profile.service_location_id,
            "latitude": profile.latitude,
            "longitude": profile.longitude,
            "tags": ["plumbing"],
            "certificate_name": profile.certificate_name,
            "certificate_url": profile.certificate_url,
            "hourly_rate": profile.hourly_rate,
            "verification_status": profile.verification_status,
            "identity_verification_status": profile.identity_verification_status,
            "qualification_verification_status": profile.qualification_verification_status,
        }
    finally:
        db.close()


def set_week_availability(client, headers):
    response = client.put(
        "/provider/availability",
        json={
            "availabilities": [
                {
                    "weekday": weekday,
                    "start_time": "08:00:00",
                    "end_time": "20:00:00",
                    "is_available": True,
                }
                for weekday in range(1, 8)
            ]
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text


def approve_provider(client, admin_headers, provider_profile_id):
    del client, admin_headers
    db = SessionLocal()
    try:
        profile = db.get(models.ProviderProfile, provider_profile_id)
        assert profile is not None
        profile.identity_verification_status = "approved"
        profile.qualification_verification_status = "approved"
        profile.verification_status = "approved"
        user = db.get(models.User, profile.user_id)
        user.identity_verification_status = "approved"
        user.qualification_verification_status = "approved"
        db.add(
            models.ProviderApprovedService(
                provider_profile_id=profile.id,
                service_category="plumbing",
                is_enabled=True,
            )
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture
def marketplace(client, db_session, monkeypatch, fake_iyzico):
    del fake_iyzico
    monkeypatch.setattr("backend.routers.admin.create_notification", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        "backend.utils.notification.enqueue_notification_delivery",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        "backend.utils.notification.increment_notification_unread_count",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        "backend.utils.chat.increment_chat_room_unread_count",
        lambda *args, **kwargs: 0,
    )
    monkeypatch.setattr("backend.utils.formatters.is_user_online", lambda *_: False)
    customer = register_session(
        client, "customer@example.com", role="customer", name="Ayla Customer"
    )
    provider = register_session(
        client, "provider@example.com", role="provider", name="Can Provider"
    )
    admin = create_admin_session(client, db_session)
    profile = create_provider_profile(client, provider["headers"])
    approve_provider(client, admin["headers"], profile["id"])
    set_week_availability(client, provider["headers"])
    return {
        "customer": customer,
        "provider": provider,
        "admin": admin,
        "provider_profile": profile,
    }


def create_booking(client, customer_headers, provider_profile_id, **extra):
    payload = {
        "provider_profile_id": str(provider_profile_id),
        "title": extra.get("title", "Booking request"),
        "service_description": extra.get(
            "service_description", "Kitchen pipe leak, needs on-site repair"
        ),
        "service_address": extra.get("service_address", "Sultanahmet, Istanbul"),
        "service_latitude": "41.0082",
        "service_longitude": "28.9784",
        "scheduled_start_time": extra.get(
            "scheduled_start_time", BOOKING_START.isoformat()
        ),
        "scheduled_end_time": extra.get("scheduled_end_time", BOOKING_END.isoformat()),
    }
    response = client.post("/bookings", data=payload, headers=customer_headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]["booking"]

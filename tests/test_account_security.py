from backend.constants import DEMO_PASSWORD
from tests.conftest import create_admin_session, login, register, register_session


def _auth_headers(client, email, password=DEMO_PASSWORD):
    session = login(client, email=email, password=password)
    assert session.status_code == 200, session.text
    return {"Authorization": f"Bearer {session.json()['data']['access_token']}"}


def test_register_starts_unverified_until_confirm(client):
    created = register(client, email="verify-me@example.com")
    assert created.status_code == 200
    assert created.json()["data"]["user"]["email_verified"] is False

    headers = _auth_headers(client, "verify-me@example.com")
    confirmed = client.post("/auth/verify-email", json={"code": "123456"}, headers=headers)

    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["data"]["email_verified"] is True

    me = client.get("/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["data"]["email_verified"] is True


def test_verify_email_rejects_non_six_digit_codes(client):
    customer = register_session(client, "bad-code@example.com")

    for code in ("12345", "1234567", "abcdef", "12 456"):
        response = client.post(
            "/auth/verify-email",
            json={"code": code},
            headers=customer["headers"],
        )
        assert response.status_code == 422, code


def test_verify_phone_requires_a_phone_number(client):
    customer = register_session(client, "no-phone@example.com")

    missing = client.post(
        "/auth/verify-phone",
        json={"code": "000000"},
        headers=customer["headers"],
    )
    assert missing.status_code == 400
    assert "phone" in missing.json()["message"].lower()

    created = client.post(
        "/customer/profile",
        json={
            "phone_number": "+905551112233",
            "address": "1 Demo Street",
            "service_province": "Istanbul",
        },
        headers=customer["headers"],
    )
    assert created.status_code == 200, created.text

    confirmed = client.post(
        "/auth/verify-phone",
        json={"code": "654321"},
        headers=customer["headers"],
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["data"]["phone_verified"] is True


def test_changing_phone_clears_phone_verified(client):
    customer = register_session(client, "phone-reset@example.com")
    client.post(
        "/customer/profile",
        json={
            "phone_number": "+905551112233",
            "address": "1 Demo Street",
            "service_province": "Istanbul",
        },
        headers=customer["headers"],
    )
    client.post("/auth/verify-phone", json={"code": "111111"}, headers=customer["headers"])

    patched = client.patch(
        "/customer/profile",
        json={"phone_number": "+905559998877"},
        headers=customer["headers"],
    )
    assert patched.status_code == 200, patched.text

    me = client.get("/me", headers=customer["headers"])
    assert me.json()["data"]["phone_verified"] is False


def test_seed_style_admin_is_already_email_verified(client, db_session):
    admin = create_admin_session(client, db_session)
    me = client.get("/me", headers=admin["headers"])
    assert me.status_code == 200
    assert me.json()["data"]["email_verified"] is True


def test_change_password_rejects_wrong_current_password(client):
    customer = register_session(client, "change-password@example.com")

    rejected = client.post(
        "/auth/change-password",
        json={"current_password": "Wrong1234", "new_password": "Newpass12"},
        headers=customer["headers"],
    )
    assert rejected.status_code == 400
    assert "password" in rejected.json()["message"].lower()


def test_change_password_updates_login_credentials(client):
    register(client, email="new-password@example.com")
    headers = _auth_headers(client, "new-password@example.com")

    changed = client.post(
        "/auth/change-password",
        json={"current_password": DEMO_PASSWORD, "new_password": "Newpass12"},
        headers=headers,
    )
    assert changed.status_code == 200, changed.text

    old_login = login(client, "new-password@example.com", DEMO_PASSWORD)
    assert old_login.status_code == 401

    new_login = login(client, "new-password@example.com", "Newpass12")
    assert new_login.status_code == 200


def test_change_email_uses_mock_code_and_updates_login(client):
    register(client, email="old-email@example.com")
    headers = _auth_headers(client, "old-email@example.com")

    changed = client.post(
        "/auth/change-email",
        json={"new_email": "next-email@example.com", "code": "123456"},
        headers=headers,
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["data"]["email"] == "next-email@example.com"
    assert changed.json()["data"]["email_verified"] is True

    old_login = login(client, "old-email@example.com")
    assert old_login.status_code == 401

    new_login = login(client, "next-email@example.com")
    assert new_login.status_code == 200
    assert new_login.json()["data"]["user"]["email"] == "next-email@example.com"


def test_change_email_rejects_taken_address(client):
    register(client, email="taken@example.com")
    customer = register_session(client, "changer@example.com")

    rejected = client.post(
        "/auth/change-email",
        json={"new_email": "taken@example.com", "code": "123456"},
        headers=customer["headers"],
    )
    assert rejected.status_code == 400
    assert "email" in rejected.json()["message"].lower()


def test_change_email_rejects_non_six_digit_codes(client):
    customer = register_session(client, "change-email-code@example.com")

    rejected = client.post(
        "/auth/change-email",
        json={"new_email": "fresh@example.com", "code": "12ab56"},
        headers=customer["headers"],
    )
    assert rejected.status_code == 422

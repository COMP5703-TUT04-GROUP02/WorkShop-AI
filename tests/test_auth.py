from tests.conftest import create_admin_session, login, register, register_session
from backend.services.social_auth_service import VerifiedSocialIdentity


def test_register_rejects_admin_role(client):
    response = register(client, email="admin@example.com", role="admin")
    assert response.status_code == 400
    assert "admin" in response.json()["message"].lower()


def test_register_rejects_weak_password(client):
    response = register(client, email="weak@example.com", password="weakpass")
    assert response.status_code == 400
    assert "password" in response.json()["message"].lower() or "upper" in response.json()[
        "message"
    ].lower()


def test_register_and_login(client):
    created = register(client)
    assert created.status_code == 200
    assert created.json()["success"] is True
    assert created.json()["data"]["user"]["email"] == "customer@example.com"
    assert created.json()["data"]["user"]["role"] == "customer"
    # The sign-up code proved the address, so the account starts verified.
    assert created.json()["data"]["user"]["email_verified"] is True
    assert created.json()["data"]["user"]["phone_verified"] is False

    session = login(client)
    assert session.status_code == 200
    data = session.json()["data"]
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["token_type"] == "bearer"

    me = client.get("/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["data"]["email"] == "customer@example.com"
    assert me.json()["data"]["email_verified"] is True
    assert me.json()["data"]["phone_verified"] is False


def test_duplicate_register_is_rejected(client):
    assert register(client).status_code == 200
    again = register(client)
    assert again.status_code == 400


def test_register_and_login_ignore_email_case(client):
    created = register(client, email="Case.User@Example.COM")
    assert created.status_code == 200
    assert created.json()["data"]["user"]["email"] == "case.user@example.com"

    session = login(client, email="CASE.USER@example.com")
    assert session.status_code == 200

    again = register(client, email="case.user@EXAMPLE.com")
    assert again.status_code == 400


def test_logout_revokes_access_token(client):
    register(client)
    session = login(client).json()["data"]
    access = session["access_token"]
    refresh = session["refresh_token"]

    logged_out = client.post("/logout", json={"refresh_token": refresh})
    assert logged_out.status_code == 200

    me = client.get("/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 401


def test_logout_revokes_refresh_token(client):
    register(client)
    session = login(client).json()["data"]
    refresh = session["refresh_token"]

    assert client.post("/logout", json={"refresh_token": refresh}).status_code == 200
    again = client.post("/refresh-token", json={"refresh_token": refresh})
    assert again.status_code == 401


def test_refresh_token_issues_new_pair(client):
    register(client)
    session = login(client).json()["data"]
    refreshed = client.post(
        "/refresh-token", json={"refresh_token": session["refresh_token"]}
    )
    assert refreshed.status_code == 200
    data = refreshed.json()["data"]
    assert data["access_token"]
    assert data["refresh_token"] != session["refresh_token"]

    me = client.get("/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200


def test_social_login_creates_customer(client, monkeypatch):
    monkeypatch.setattr(
        "backend.routers.auth.verify_social_identity",
        lambda provider, token, nonce=None: VerifiedSocialIdentity(
            provider="google",
            provider_user_id="google-sub-1",
            email="google.user@example.com",
            name="Google User",
        ),
    )
    response = client.post(
        "/social-login",
        json={
            "provider": "google",
            "id_token": "fake-token",
            "role": "customer",
            "tos_accepted": True,
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["is_new_user"] is True
    assert data["user"]["email"] == "google.user@example.com"
    assert data["user"]["email_verified"] is True
    assert data["access_token"]


def test_admin_can_ban_user(client, db_session):
    admin = create_admin_session(client, db_session)
    customer = register_session(client, "banned@example.com", role="customer")
    user_id = customer["user"]["id"]

    banned = client.put(
        f"/admin/users/{user_id}/status",
        json={"is_banned": True},
        headers=admin["headers"],
    )
    assert banned.status_code == 200, banned.text

    blocked = login(client, "banned@example.com")
    assert blocked.status_code == 403

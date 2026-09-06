from backend.utils.ai_pending_action import create_ai_pending_action
from tests.conftest import create_booking


def test_ai_chat_sync_returns_service_error_without_key(client, marketplace):
    response = client.post(
        "/ai/chat/sync",
        json={"message": "I need a plumber in Istanbul"},
        headers=marketplace["customer"]["headers"],
    )
    assert response.status_code == 200, response.text
    body = response.json()["data"]
    assert body["type"] == "ai_service_error" or body.get("intent", {}).get("intent") == "ai_service_error"


def test_ai_chat_sync_with_mocked_handler(client, marketplace, monkeypatch):
    monkeypatch.setattr(
        "backend.routers.ai.handle_ai_chat_request",
        lambda request_data, current_user, db: {
            "message": request_data.message,
            "type": "answer",
            "intent": {"intent": "search_providers", "confidence": 1, "reason": "test"},
            "answer": "Here are nearby plumbers.",
        },
    )
    response = client.post(
        "/ai/chat/sync",
        json={"message": "Find a plumber"},
        headers=marketplace["customer"]["headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["answer"] == "Here are nearby plumbers."


def test_ai_pending_action_confirm_cancels_booking(client, marketplace, db_session):
    customer = marketplace["customer"]
    booking = create_booking(
        client, customer["headers"], marketplace["provider_profile"]["id"]
    )
    created = create_ai_pending_action(
        customer["user"]["id"],
        "cancel_booking",
        {"booking_id": booking["id"]},
        "Cancel this booking",
        [],
        db_session,
    )
    confirmed = client.post(
        "/ai/actions/confirm",
        json={"action_id": created["id"]},
        headers=customer["headers"],
    )
    assert confirmed.status_code == 200, confirmed.text
    detail = client.get(f"/bookings/{booking['id']}", headers=customer["headers"])
    assert detail.json()["data"]["status"] == "cancelled"


def test_ai_pending_action_can_be_cancelled(client, marketplace, db_session):
    customer = marketplace["customer"]
    booking = create_booking(
        client, customer["headers"], marketplace["provider_profile"]["id"]
    )
    created = create_ai_pending_action(
        customer["user"]["id"],
        "cancel_booking",
        {"booking_id": booking["id"]},
        "Cancel this booking",
        [],
        db_session,
    )
    cancelled = client.put(
        f"/ai/actions/{created['id']}/cancel",
        headers=customer["headers"],
    )
    assert cancelled.status_code == 200, cancelled.text
    detail = client.get(f"/bookings/{booking['id']}", headers=customer["headers"])
    assert detail.json()["data"]["status"] == "pending"


def test_admin_oauth_status(client, marketplace):
    response = client.get("/ai/oauth", headers=marketplace["admin"]["headers"])
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["auth"] in {"key", "chatgpt"}
    assert "chatgpt" in data


def test_admin_redis_health_reports_status(client, marketplace, monkeypatch):
    monkeypatch.setattr("backend.routers.ai.check_redis_connection", lambda: True)
    response = client.get("/ai/health/redis", headers=marketplace["admin"]["headers"])
    assert response.status_code == 200
    assert response.json()["data"]["redis"] == "ok"


def test_admin_milvus_health_reports_status(client, marketplace, monkeypatch):
    monkeypatch.setattr("backend.routers.ai.check_milvus_connection", lambda: "2.4-test")
    response = client.get("/ai/health/milvus", headers=marketplace["admin"]["headers"])
    assert response.status_code == 200
    assert response.json()["data"]["milvus"] == "ok"

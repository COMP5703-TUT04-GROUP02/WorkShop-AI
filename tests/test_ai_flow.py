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
    assert data["auth"] in {"key", "chatgpt", "grok"}
    assert "chatgpt" in data
    assert "grok" in data
    assert any(item["id"] == "claude" for item in data["providers"])
    assert data["key"]["source"] in {"admin", "env", "none"}
    assert "api_key_preview" in data["key"]


def test_admin_can_save_and_clear_api_key(client, marketplace, tmp_path, monkeypatch):
    monkeypatch.setattr(
        "backend.ai.oauth.api_key.ADMIN_KEY_PATH",
        tmp_path / "llm_api.json",
    )
    headers = marketplace["admin"]["headers"]
    saved = client.put(
        "/ai/oauth/key",
        json={
            "provider": "qwen",
            "api_key": "sk-admin-test-key",
            "model": "qwen3.8-max",
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    data = saved.json()["data"]
    assert data["auth"] == "key"
    assert data["key"]["source"] == "admin"
    assert data["key"]["provider"] == "qwen"
    assert data["key"]["api_key_preview"] == "sk-a…-key"
    assert "sk-admin-test-key" not in saved.text

    forbidden = client.put(
        "/ai/oauth/key",
        json={"provider": "qwen", "api_key": "sk-customer"},
        headers=marketplace["customer"]["headers"],
    )
    assert forbidden.status_code == 403

    cleared = client.delete("/ai/oauth/key", headers=headers)
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["data"]["key"]["source"] != "admin"


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


def test_booking_flow_knowledge_uses_current_statuses():
    from backend.ai.tools import BOOKING_FLOW_STEPS, BOOKING_STATUS_EXPLANATIONS
    from backend.schemas.booking import BookingStatus

    valid = {status.value for status in BookingStatus}
    assert set(BOOKING_STATUS_EXPLANATIONS) <= valid
    for legacy in ("accepted", "awaiting_payment"):
        assert legacy not in BOOKING_STATUS_EXPLANATIONS

    for status in (
        "awaiting_visit_payment",
        "visit_paid",
        "provider_arrived",
        "awaiting_final_quote",
        "final_quote_sent",
        "awaiting_service_payment",
        "service_paid",
        "awaiting_confirmation",
        "completed",
        "refunding",
    ):
        assert status in BOOKING_STATUS_EXPLANATIONS

    flow = " ".join(BOOKING_FLOW_STEPS)
    ordered = ["visit_paid", "provider_arrived", "final_quote_sent", "service_paid", "awaiting_confirmation", "completed"]
    positions = [flow.index(status) for status in ordered]
    assert positions == sorted(positions)
    assert "never refunds automatically" in flow
    assert "appeal" in flow


def test_explain_booking_flow_topics_match_refund_and_cancel_rules():
    from backend.ai.tools import BOOKING_STATUS_EXPLANATIONS, explain_booking_flow_tool

    refund = explain_booking_flow_tool("refund")["statuses"]
    assert "provider_arrived" in refund
    assert "refunding" in refund
    assert any("appeal" in action for action in refund["refunding"]["next_actions"])

    cancel = explain_booking_flow_tool("cancel")["statuses"]
    assert set(cancel) >= {"pending", "quoted", "awaiting_visit_payment", "cancelled"}
    assert "not refunded automatically" in cancel["visit_completed_closed"]["meaning"]

    payment = explain_booking_flow_tool("payment")["statuses"]
    assert {"awaiting_visit_payment", "awaiting_service_payment"} <= set(payment)

    for topic in ("pending", "quote", "final_quote", "visit", "pay", "complete", "complaint", "reject"):
        statuses = explain_booking_flow_tool(topic)["statuses"]
        assert statuses
        assert set(statuses) <= set(BOOKING_STATUS_EXPLANATIONS)

    assert set(explain_booking_flow_tool(None)["statuses"]) == set(BOOKING_STATUS_EXPLANATIONS)

import json

from backend.utils.ai_pending_action import create_ai_pending_action
from backend.utils.ai_chat import save_ai_chat_message
from backend import models
from backend.ai.tools import (
    prepare_booking_draft_action_tool,
    summarize_provider_reviews_tool,
)


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


def test_removed_ai_action_type_cannot_be_created(marketplace, db_session):
    from fastapi import HTTPException
    import pytest

    with pytest.raises(HTTPException) as exc:
        create_ai_pending_action(
            marketplace["customer"]["user"]["id"],
            "cancel_booking",
            {"booking_id": 1},
            "Cancel this booking",
            [],
            db_session,
        )
    assert exc.value.status_code == 400


def test_ai_pending_action_can_be_cancelled(client, marketplace, db_session):
    customer = marketplace["customer"]
    created = create_ai_pending_action(
        customer["user"]["id"],
        "create_booking",
        {"provider_profile_id": marketplace["provider_profile"]["id"]},
        "Create this booking",
        [],
        db_session,
    )
    cancelled = client.put(
        f"/ai/actions/{created['id']}/cancel",
        headers=customer["headers"],
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["data"]["pending_action"]["status"] == "cancelled"


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


def test_customer_ai_exposes_exactly_four_tools(client, marketplace):
    response = client.get("/ai/tools", headers=marketplace["customer"]["headers"])
    assert response.status_code == 200, response.text
    names = {item["name"] for item in response.json()["data"]}
    assert names == {
        "search_providers",
        "search_help_articles",
        "prepare_booking_draft_action",
        "summarize_provider_reviews",
    }


def test_provider_ai_exposes_no_tools(client, marketplace):
    response = client.get("/ai/tools", headers=marketplace["provider"]["headers"])
    assert response.status_code == 200, response.text
    assert response.json()["data"] == []


def test_ai_booking_draft_asks_only_for_task_description(marketplace, db_session):
    customer = db_session.get(models.User, marketplace["customer"]["user"]["id"])

    result = prepare_booking_draft_action_tool(
        current_user=customer,
        db=db_session,
        provider_profile_id=marketplace["provider_profile"]["id"],
    )

    assert result["draft_status"] == "missing_info"
    assert result["missing_field_names"] == ["service_description"]
    assert "latitude" not in result["missing_field_names"]
    assert "scheduled_start_time" not in result["missing_field_names"]


def test_ai_booking_draft_returns_standard_form_defaults(marketplace, db_session):
    customer = db_session.get(models.User, marketplace["customer"]["user"]["id"])
    description = "Repair the leaking kitchen pipe and check the connection."

    result = prepare_booking_draft_action_tool(
        current_user=customer,
        db=db_session,
        provider_profile_id=marketplace["provider_profile"]["id"],
        service_description=description,
    )

    assert result["draft_status"] == "ready_for_form"
    assert result["provider_profile_id"] == marketplace["provider_profile"]["id"]
    assert result["form_defaults"]["service_description"] == description
    assert result["form_defaults"]["title"]
    assert result["provider"]["business_name"] == "Bosphorus Plumbing"


def test_review_tool_generates_summary_from_retrieved_context(
    marketplace,
    db_session,
    monkeypatch,
):
    customer = db_session.get(models.User, marketplace["customer"]["user"]["id"])
    monkeypatch.setattr(
        "backend.ai.tools.summarize_reviews_with_model",
        lambda question, context: f"Compared {len(context)} provider(s): {question}",
    )

    result = summarize_provider_reviews_tool(
        question="Which provider performs better?",
        provider_ids=[marketplace["provider_profile"]["id"]],
        current_user=customer,
        db=db_session,
    )

    assert result["answer"].startswith("Compared 1 provider(s)")
    assert result["answer"] != "I found relevant review data."
    assert result["review_context"][0]["business_name"] == "Bosphorus Plumbing"
    assert "average_rating" in result["review_context"][0]


def test_successful_booking_consumes_matching_ai_booking_form(
    client,
    marketplace,
    db_session,
):
    from tests.conftest import create_booking

    provider = marketplace["provider_profile"]
    customer = marketplace["customer"]
    ready_message = save_ai_chat_message(
        user_id=customer["user"]["id"],
        role="assistant",
        message="I opened the booking form.",
        intent="create_booking",
        response_type="booking_form_ready",
        metadata={
            "booking_form": {
                "draft_status": "ready_for_form",
                "provider_profile_id": provider["id"],
                "form_defaults": {
                    "title": "Pipe repair",
                    "service_description": "Repair the kitchen pipe.",
                },
            }
        },
        db=db_session,
    )

    booking = create_booking(client, customer["headers"], provider["id"])
    db_session.expire_all()
    updated_message = db_session.get(models.AIChatMessage, ready_message.id)
    metadata = json.loads(updated_message.metadata_json)

    assert metadata["booking_form"] is None
    assert metadata["booking_form_status"] == "submitted"
    assert metadata["booking_id"] == booking["id"]
    assert "Booking request sent to Bosphorus Plumbing" in updated_message.message

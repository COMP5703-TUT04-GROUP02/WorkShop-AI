from langchain_core.messages import AIMessage

from backend.ai.tool_calling import (
    canned_answer_from_tool_results,
    should_retry_tool_choice,
)
from backend.utils.ai import (
    CASUAL_LOCAL_ANSWER,
    looks_like_casual_greeting_only,
)


def test_casual_greeting_does_not_eat_real_requests():
    assert looks_like_casual_greeting_only("hi")
    assert looks_like_casual_greeting_only("Hello!")
    assert looks_like_casual_greeting_only("merhaba")
    assert not looks_like_casual_greeting_only("hi I need a plumber")
    assert not looks_like_casual_greeting_only("who are you")


def test_canned_answer_requires_every_tool_result():
    assert (
        canned_answer_from_tool_results(
            [{"result": {"answer": "Here is what I can help with."}}]
        )
        == "Here is what I can help with."
    )
    assert canned_answer_from_tool_results([{"result": {"count": 3}}]) is None
    assert canned_answer_from_tool_results([{"error": "failed"}]) is None


def test_hello_uses_local_casual_answer(client, marketplace, monkeypatch):
    def boom(*_args, **_kwargs):
        raise AssertionError("tool calling should not run for greetings")

    monkeypatch.setattr(
        "backend.utils.ai_chat_handler.choose_and_run_langchain_tools",
        boom,
    )
    response = client.post(
        "/ai/chat/sync",
        json={"message": "hi"},
        headers=marketplace["customer"]["headers"],
    )
    assert response.status_code == 200, response.text
    body = response.json()["data"]
    assert body["type"] == "casual_chat"
    assert body["answer"] == CASUAL_LOCAL_ANSWER


def test_tool_calling_context_accepts_datetimes():
    from datetime import datetime, timezone

    from backend.ai.tool_calling import build_tool_calling_user_message

    message = build_tool_calling_user_message(
        "book the first provider",
        {"booking_draft": {"created_at": datetime(2026, 10, 7, tzinfo=timezone.utc)}},
    )
    assert "2026-10-07T00:00:00+00:00" in message


def test_tool_choice_retries_model_when_provider_context_exists():
    response = AIMessage(content="You selected the first provider.")
    context = {"recommended_provider_context": [{"provider_id": 12}]}

    assert should_retry_tool_choice(response, context)
    assert not should_retry_tool_choice(response, {})


def test_tool_choice_retries_model_when_booking_draft_exists():
    response = AIMessage(content="What work do you need?")
    context = {"booking_draft": {"draft_type": "create_booking"}}

    assert should_retry_tool_choice(response, context)


def test_tool_choice_does_not_retry_after_a_tool_call():
    response = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "prepare_booking_draft_action",
                "args": {"provider_profile_id": 12},
                "id": "call-1",
                "type": "tool_call",
            }
        ],
    )

    assert not should_retry_tool_choice(
        response,
        {"recommended_provider_context": [{"provider_id": 12}]},
    )

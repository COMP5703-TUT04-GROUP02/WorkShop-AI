"""LangChain tool-calling flow.

The model decides whether to call tools from user input and context. After
execution, canned tool answers are used when present; the chat handler otherwise
formats the reply. All tool calls are logged to `ai_tool_call_logs`.
"""

from typing import Any

import json
import time

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend import models
from backend.ai.clients import get_message_content, get_qwen_chat_model
from backend.ai.langchain_tools import build_langchain_tools
from backend.utils.ai_tool_log import create_ai_tool_call_log

TOOL_CALLING_SYSTEM_PROMPT = """You are Workshop AI's customer assistant. You have exactly four tools. Never claim or attempt any capability outside them, and do not name a chat vendor or model.

## Routing
- Recommend local providers: search_providers. service_tags must be core tags only: cleaning, childcare, elderly_care, electrician, plumbing, painter, locksmith, technician, moving. Never map an unknown need to another tag; use an empty array.
- Answer a customer FAQ or policy/how-to question: search_help_articles with a short English query and the best matching FAQ ids.
- Help place an order: prepare_booking_draft_action only. Booking overrides provider search when the user explicitly asks to book, reserve, or create an order.
- Compare providers using reviews, price, attitude, or reputation: summarize_provider_reviews.

## References
- Resolve rank and name references from recommended_provider_context or candidate_provider_ids before choosing a tool. Never invent a provider_profile_id.
- Decide what the customer wants to do with the resolved provider separately from resolving which provider they mean.
- A provider selection by itself is booking intent after recommendations. Examples: "first one", "choose the first one", "book the second provider", "就选第一个", "第一个", and "跟第一个下单". You MUST call prepare_booking_draft_action with the resolved provider_profile_id. If no task description was given, omit it so the tool saves the selected provider and asks for the task. Never merely reply that the provider was selected.
- A question asking for an opinion, reviews, reputation, or comparison is review intent, not booking intent. Examples: "how is the first one?", "reviews for the second provider", "compare the first and second", "第一个怎么样", "评价第一个商家", and "对比第一和第二个商家". You MUST call summarize_provider_reviews with the resolved provider ids.
- When the message contains both a provider reference and an explicit request to book or order, booking intent wins unless the user is clearly asking about reviews or comparison instead.
- If a booking draft lacks provider_profile_id and the user picks by rank or price, use recommended_provider_context.

## Drafts
- Call prepare_booking_draft_action even with partial information. It needs only a provider and a specific task description.
- If the provider is known but the task is vague or absent, ask what specific work the customer needs.
- When the customer provides the task, rewrite it as a concise, professional service description in the customer's language. Preserve every fact and never invent requirements, urgency, materials, or damage.
- If booking_draft exists and the user changes the provider or task description, pass only the new fields.
- If the user cancels the draft ("start over", "never mind", "don't book"), do not continue it.
- A complete draft opens the normal booking form. The customer chooses the service category, location, schedule, and attachments there, then submits it personally.
- Never ask for an address, latitude, longitude, service category, appointment time, or attachment in AI chat.
- Never say an order exists merely because the booking form was prepared.

## Safety
- Do not invent provider_profile_id, task details, FAQ content, or review facts.
- This tool never creates a booking; booking creation happens only when the customer submits the normal booking form.
- Do not offer AI chat, booking-status lookup, payment, refund, cancellation, quote, completion, or other removed tools. Direct users to the normal app screens or FAQ where appropriate.
- Reply in the user's language. Quote money in TRY.
"""

TOOL_CHOICE_RETRY_PROMPT = (
    "Re-evaluate the last answer before replying. It did not invoke a tool even though "
    "the conversation may contain provider recommendations or an active booking draft. "
    "First resolve which provider the user means from the supplied context, then decide "
    "whether the user wants to book that provider or evaluate/compare them. A provider "
    "selection by itself after recommendations is booking intent and MUST call "
    "prepare_booking_draft_action. A review, opinion, reputation, or comparison request "
    "MUST call summarize_provider_reviews. Never say a provider was selected unless the "
    "booking tool was actually called. "
    "If no tool fits, reply in the user's language about what information is still needed. "
    "Do not invent parameters or call tools unnecessarily."
)


def build_tool_calling_user_message(
    message: str,
    context: dict[str, Any] | None = None,
):
    if not context:
        return message

    return (
        f"User message: {message}\n\n"
        "Available context: "
        # Actionable bookings carry datetimes, which json.dumps cannot encode.
        f"{json.dumps(jsonable_encoder(context), ensure_ascii=False)}"
    )


def canned_answer_from_tool_results(tool_results: list[dict[str, Any]]) -> str | None:
    answers = []
    for tool_result in tool_results:
        if tool_result.get("error"):
            return None
        payload = tool_result.get("result") or {}
        if not isinstance(payload, dict):
            return None
        answer = str(payload.get("answer") or "").strip()
        if not answer:
            return None
        answers.append(answer)
    if not answers:
        return None
    return "\n\n".join(answers)


def should_retry_tool_choice(
    response,
    context: dict[str, Any] | None = None,
):
    """Retry model routing when conversational state suggests a tool may be needed."""

    if response.tool_calls:
        return False

    if not get_message_content(response).strip():
        return True

    context = context or {}
    return bool(
        context.get("recommended_provider_context")
        or context.get("candidate_provider_ids")
        or context.get("booking_draft")
    )


def select_langchain_tools(
    current_user: models.User,
    db: Session,
    allowed_tool_names: list[str] | None = None,
):
    tools = build_langchain_tools(current_user, db)

    if allowed_tool_names is None:
        return tools

    allowed_tool_name_set = set(allowed_tool_names)
    return [tool for tool in tools if tool.name in allowed_tool_name_set]


def get_business_error_code(status_code: int | None, detail: Any):
    detail_text = str(detail or "").lower()

    if status_code == 401:
        return "UNAUTHENTICATED"
    if status_code == 403:
        return "FORBIDDEN"
    if status_code == 404:
        if "provider" in detail_text:
            return "PROVIDER_NOT_FOUND"
        if "booking" in detail_text:
            return "BOOKING_NOT_FOUND"
        if "refund" in detail_text:
            return "REFUND_REQUEST_NOT_FOUND"
        if "chat" in detail_text:
            return "CHAT_ROOM_NOT_FOUND"
        return "RESOURCE_NOT_FOUND"
    if status_code == 422:
        return "VALIDATION_ERROR"
    if status_code == 400:
        if "approved" in detail_text and "provider" in detail_text:
            return "PROVIDER_NOT_APPROVED"
        if "latitude" in detail_text or "longitude" in detail_text:
            return "MISSING_LOCATION"
        if "available" in detail_text:
            return "PROVIDER_NOT_AVAILABLE"
        if (
            "pending" in detail_text
            or "quoted" in detail_text
            or "status" in detail_text
        ):
            return "BOOKING_STATUS_NOT_ALLOWED"
        if "reason" in detail_text:
            return "REASON_REQUIRED"
        return "BAD_REQUEST"

    return "TOOL_EXECUTION_ERROR"


def format_tool_error(error: Exception):
    if isinstance(error, HTTPException):
        return {
            "error": str(error.detail),
            "error_code": get_business_error_code(error.status_code, error.detail),
            "error_type": "http_exception",
            "status_code": error.status_code,
            "error_details": error.detail,
        }

    if isinstance(error, ValidationError):
        return {
            "error": "Tool argument validation error",
            "error_code": "VALIDATION_ERROR",
            "error_type": "validation_error",
            "status_code": 422,
            "error_details": error.errors(),
        }

    return {
        "error": str(error),
        "error_code": "TOOL_EXECUTION_ERROR",
        "error_type": error.__class__.__name__,
        "status_code": None,
        "error_details": None,
    }


def execute_langchain_tool_call(
    tool_name: str,
    tool_args: dict,
    current_user: models.User,
    db: Session,
    message: str,
    context: dict[str, Any] | None = None,
):
    """Execute one LangChain tool and log success/failure.

    Catches HTTPException, ValidationError, and other exceptions into tool_error.
    """

    tools = build_langchain_tools(current_user, db)
    tool_map = {tool.name: tool for tool in tools}
    tool = tool_map.get(tool_name)
    start_time = time.perf_counter()

    if not tool:
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        tool_result = {
            "tool_name": tool_name,
            "tool_args": tool_args,
            "error": "Tool not found",
            "error_code": "TOOL_NOT_FOUND",
            "error_type": "tool_not_found",
            "status_code": 404,
            "error_details": None,
        }
        log = create_ai_tool_call_log(
            user_id=current_user.id,
            tool_name=tool_name,
            tool_args=tool_args,
            status="failed",
            duration_ms=duration_ms,
            db=db,
            error_message=tool_result["error"],
            error_type=tool_result["error_type"],
            status_code=tool_result["status_code"],
            request_message=message,
            context=context,
        )
        tool_result["tool_call_log_id"] = log.id

        return tool_result

    try:
        result = jsonable_encoder(tool.invoke(tool_args))
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        log = create_ai_tool_call_log(
            user_id=current_user.id,
            tool_name=tool_name,
            tool_args=tool_args,
            status="success",
            duration_ms=duration_ms,
            db=db,
            result=result,
            request_message=message,
            context=context,
        )

        return {
            "tool_name": tool_name,
            "tool_args": tool_args,
            "result": result,
            "tool_call_log_id": log.id,
        }
    except Exception as error:
        db.rollback()
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        formatted_error = format_tool_error(error)
        log = create_ai_tool_call_log(
            user_id=current_user.id,
            tool_name=tool_name,
            tool_args=tool_args,
            status="failed",
            duration_ms=duration_ms,
            db=db,
            error_message=formatted_error["error"],
            error_type=formatted_error["error_type"],
            status_code=formatted_error["status_code"],
            request_message=message,
            context=context,
        )

        return {
            "tool_name": tool_name,
            "tool_args": tool_args,
            **formatted_error,
            "tool_call_log_id": log.id,
        }


def choose_and_run_langchain_tools(
    message: str,
    current_user: models.User,
    db: Session,
    context: dict[str, Any] | None = None,
    allowed_tool_names: list[str] | None = None,
    extra_system_prompt: str | None = None,
):
    tools = select_langchain_tools(current_user, db, allowed_tool_names)
    model = get_qwen_chat_model(temperature=0, max_tokens=500).bind_tools(tools)
    messages = [
        SystemMessage(content=TOOL_CALLING_SYSTEM_PROMPT),
        HumanMessage(content=build_tool_calling_user_message(message, context)),
    ]
    if extra_system_prompt:
        messages.insert(1, SystemMessage(content=extra_system_prompt))

    first_response = model.invoke(messages)

    if should_retry_tool_choice(first_response, context):
        retry_messages = [
            *messages,
            SystemMessage(content=TOOL_CHOICE_RETRY_PROMPT),
        ]
        first_response = model.invoke(retry_messages)
        messages = retry_messages

    tool_calls = first_response.tool_calls or []

    if not tool_calls:
        answer = get_message_content(first_response).strip()

        return {
            "message": message,
            "type": "no_tool_call",
            "answer": answer or "No suitable capability found. Please describe your need in more detail.",
            "tool_calls": [],
            "tool_results": [],
        }

    tool_results = []

    for tool_call in tool_calls:
        tool_name = tool_call["name"]
        tool_args = tool_call.get("args") or {}
        tool_result = execute_langchain_tool_call(
            tool_name,
            tool_args,
            current_user,
            db,
            message,
            context,
        )
        tool_results.append(tool_result)

    return {
        "message": message,
        "type": "tool_call",
        "answer": canned_answer_from_tool_results(tool_results),
        "tool_calls": jsonable_encoder(tool_calls),
        "tool_results": tool_results,
        "final_answer_error": None,
    }

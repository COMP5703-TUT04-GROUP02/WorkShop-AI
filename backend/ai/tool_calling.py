"""LangChain tool-calling flow.

The model decides whether to call tools from user input and context; after execution,
the tool results are passed back for a final English answer.
All tool calls are logged to `ai_tool_call_logs` for debugging.
"""

from typing import Any

import json
import time

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend import models
from backend.ai.clients import get_message_content, get_qwen_chat_model
from backend.ai.langchain_tools import build_langchain_tools
from backend.utils.ai_tool_log import create_ai_tool_call_log

TOOL_CALLING_SYSTEM_PROMPT = (
    "You are Workshop AI's tool-calling assistant."
    "Choose tools based on user needs."
    "User messages may include context; actionable_context lists bookings or refund requests the user can act on."
    "When the user says 'this booking', 'that order', 'this refund', etc., use actionable_context to fill booking_id or refund_request_id."
    "Only auto-fill an id when there is a single candidate or the user clearly refers to one record; otherwise ask which one — do not guess."
    "If the action is clear but booking_id or refund_request_id is missing, call the tool with known args;"
    "the backend will return choices for the user."
    "For local service providers, call search_providers."
    "For search_providers, service_tags must use core tags only: cleaning, childcare, elderly_care, electrician, plumbing, painter, locksmith, technician, moving."
    "Do not map unrecognized needs to other; pass an empty service_tags array when no core tag fits."
    "If the user wants to book, create an order, reserve, or order from a provider, always call prepare_booking_draft_action first —"
    "do not call search_providers. Booking intent overrides search intent."
    "If the user asks what you can do, how to use you, or similar (including minor typos), call get_platform_capabilities."
    "For reviews, price, attitude, or reputation of candidates, call summarize_provider_reviews."
    "To chat with a provider when provider_profile_id is known, call create_chat_room."
    "For a specific booking's status, quote, payment, refund, or next step with booking_id, call get_booking_status."
    "For booking flow, quotes, payment, acceptance, refunds, complaints, or cancellation rules, call explain_booking_flow."
    "To create or book a service, prefer prepare_booking_draft_action even with partial info."
    "prepare_booking_draft_action returns missing fields, provider choices, and next questions; a confirmation draft only when complete."
    "If the user says 'first one', 'number 1', etc., and recommended_provider_context or candidate_provider_ids exist,"
    "resolve to the provider_profile_id at that index for prepare_booking_draft_action, create_chat_room, or summarize_provider_reviews."
    "If booking_draft lacks provider_profile_id and the user picks by rank or price, they are choosing from recommended_provider_context."
    "If booking_draft exists and the user changes provider, address, time, or description, call prepare_booking_draft_action with only the new fields."
    "If the user cancels the draft ('start over', 'never mind', 'don't book'), do not continue booking; the backend clears the draft."
    "Do not invent provider_profile_id, address, coordinates, or appointment times."
    "For relative dates (today, tomorrow) with current_date in context, convert to ISO datetimes."
    "If date/time is unclear, leave fields empty so prepare_booking_draft_action asks for them."
    "Only call prepare_create_booking_action when provider_profile_id, description, address, location, and times are all explicit;"
    "it only creates a pending confirmation — never say the order is already created."
    "To cancel a booking with booking_id, call prepare_cancel_booking_action (confirmation draft only)."
    "To request a refund with booking_id, service_stage, and reason, call prepare_refund_request_action."
    "To pay or accept a quote with booking_id, call prepare_pay_booking_action."
    "To reject a quote with booking_id and reason, call prepare_reject_quote_action."
    "To confirm completion with booking_id, call prepare_confirm_complete_action."
    "To reject completion with booking_id and reason, call prepare_reject_complete_action."
    "Providers: quote with booking_id and amount -> prepare_quote_booking_action;"
    "reject booking -> prepare_reject_booking_action;"
    "mark complete -> prepare_complete_booking_action;"
    "approve refund -> prepare_approve_refund_action;"
    "reject refund -> prepare_reject_refund_action."
    "All database-changing actions require user confirmation first."
    "If draft_status=missing_info or missing_fields is present, tell the user what is missing"
    "and ask using the questions in missing_fields; do not say booking/payment can proceed yet."
    "If information is insufficient, do not invent parameters; explain what is still needed."
)

TOOL_CHOICE_RETRY_PROMPT = (
    "The last tool choice invoked no tools and returned an empty reply. Re-evaluate."
    "Follow system rules, the user message, and context to pick the best tool."
    "If no tool fits, reply in natural language about what information is still needed."
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
        f"{json.dumps(context, ensure_ascii=False)}"
    )


def build_tool_message_content(tool_result: dict):
    return json.dumps(jsonable_encoder(tool_result), ensure_ascii=False, default=str)


def generate_final_tool_answer(model, messages, first_response, tool_messages):
    last_error = None

    for _ in range(2):
        try:
            final_response = model.invoke([*messages, first_response, *tool_messages])
            answer = get_message_content(final_response).strip()

            if answer:
                return answer, None
        except Exception as error:
            last_error = error

    if last_error:
        error_message = f"{last_error.__class__.__name__}: {last_error}"
    else:
        error_message = "AI returned empty final answer"

    return None, error_message


def should_retry_empty_tool_choice(response):
    return not response.tool_calls and not get_message_content(response).strip()


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

    if should_retry_empty_tool_choice(first_response):
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
    tool_messages = []

    for index, tool_call in enumerate(tool_calls):
        tool_name = tool_call["name"]
        tool_args = tool_call.get("args") or {}
        tool_call_id = tool_call.get("id") or f"{tool_name}-{index}"
        tool_result = execute_langchain_tool_call(
            tool_name,
            tool_args,
            current_user,
            db,
            message,
            context,
        )

        tool_results.append(tool_result)
        tool_messages.append(
            ToolMessage(
                content=build_tool_message_content(tool_result),
                tool_call_id=tool_call_id,
            )
        )

    answer, final_answer_error = generate_final_tool_answer(
        model,
        messages,
        first_response,
        tool_messages,
    )

    if not answer:
        answer = (
            "AI finished the tool query but failed to generate the final reply."
            f"Error: {final_answer_error}"
        )

    return {
        "message": message,
        "type": "tool_call",
        "answer": answer,
        "tool_calls": jsonable_encoder(tool_calls),
        "tool_results": tool_results,
        "final_answer_error": final_answer_error,
    }

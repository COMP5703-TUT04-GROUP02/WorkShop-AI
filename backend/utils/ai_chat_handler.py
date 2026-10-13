"""AI chat orchestration.

Converts natural language into backend flows:
1. Load context: recent providers, booking drafts, actionable bookings.
2. Handle multi-turn follow-ups (e.g. "first one", location, schedule).
3. LangChain tool calling for search, reviews, status, or pending actions.
4. DB-changing actions become confirmation cards only after user confirms.
5. Greetings and capability questions are answered locally. If no tool is chosen,
   rule-based search/review fallbacks run without a second model call.
"""

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend import models
from backend.schemas import AIChatRequest
from backend.ai.tool_calling import (
    choose_and_run_langchain_tools,
    execute_langchain_tool_call,
)
from backend.ai.tools import (
    search_providers_tool,
    summarize_provider_reviews_tool,
)
from backend.services.redis_service import (
    get_last_provider_recommendation_context,
    get_last_recommended_providers,
    save_last_provider_recommendation_context,
    save_last_recommended_providers,
)
from backend.utils.ai import (
    CASUAL_LOCAL_ANSWER,
    looks_like_casual_greeting_only,
    looks_like_review_summary_question,
    parse_user_service_need,
)
from backend.utils.ai_chat import (
    build_ai_chat_request_metadata,
    get_last_booking_draft_from_history,
    build_provider_recommendation_snapshot,
    get_last_provider_recommendation_context_from_history,
    get_last_recommended_provider_ids_from_history,
    resolve_candidate_provider_ids,
    save_ai_chat_exchange,
)
from backend.utils.ai_chat_fields import (
    BOOKING_DRAFT_CONTINUATION_KEYWORDS,
    BOOKING_DRAFT_CONTINUATION_PROMPT,
    format_tool_invalid_fields_answer,
    format_tool_missing_fields_answer,
    get_tool_field_label,
    get_tool_field_question,
)


def build_langchain_tool_context(
    request_data: AIChatRequest,
    current_user: models.User,
    db: Session,
):
    """Build context for the model.

    Ground-truth data the model may reference: recent providers, booking draft,
    actionable bookings and refund requests for the current user.
    """

    recent_provider_ids = get_last_recommended_providers(current_user.id)
    history_provider_ids = get_last_recommended_provider_ids_from_history(
        current_user.id,
        db,
    )
    candidate_provider_ids = resolve_candidate_provider_ids(
        request_data.candidate_provider_ids,
        recent_provider_ids,
        history_provider_ids,
    )

    booking_draft = get_last_booking_draft_from_history(current_user.id, db)

    current_datetime = datetime.now(timezone.utc)

    return {
        "current_user": {
            "user_id": current_user.id,
            "role": current_user.role,
        },
        "current_date": current_datetime.date().isoformat(),
        "current_datetime": current_datetime.isoformat(),
        "service_province": request_data.service_province,
        "service_location_id": request_data.service_location_id,
        "service_address": request_data.service_address,
        "max_price": request_data.max_price,
        "latitude": request_data.latitude,
        "longitude": request_data.longitude,
        "max_distance_km": request_data.max_distance_km,
        "scheduled_start_time": (
            request_data.scheduled_start_time.isoformat()
            if request_data.scheduled_start_time
            else None
        ),
        "scheduled_end_time": (
            request_data.scheduled_end_time.isoformat()
            if request_data.scheduled_end_time
            else None
        ),
        "candidate_provider_ids": candidate_provider_ids,
        "recent_provider_ids": recent_provider_ids,
        "history_provider_ids": history_provider_ids,
        "recommended_provider_context": get_last_provider_recommendation_context(
            current_user.id
        )
        or get_last_provider_recommendation_context_from_history(current_user.id, db),
        "booking_draft": booking_draft,
        "tool_usage_hint": (
            "For review/price/attitude questions, pass candidate_provider_ids as provider_ids to summarize_provider_reviews."
            "Convert relative dates (today, tomorrow) using current_date."
            "If booking_draft exists, merge new fields with booking_draft.provided_fields."
            "service_address, latitude, longitude map to draft address and coordinates."
            "scheduled_start_time and scheduled_end_time map to draft appointment times."
            "Prefer prepare_booking_draft_action for booking; let the tool ask for missing fields."
        ),
    }


def get_successful_tool_result(tool_calling_result: dict):
    for tool_result in tool_calling_result.get("tool_results", []):
        if "error" not in tool_result:
            return tool_result

    return None


def get_failed_tool_result(tool_calling_result: dict):
    for tool_result in tool_calling_result.get("tool_results", []):
        if "error" in tool_result:
            return tool_result

    return None


def save_tool_calling_exchange(
    request_data: AIChatRequest,
    current_user: models.User,
    response: dict,
    request_metadata: dict,
    db: Session,
):
    """Persist one AI exchange.

    assistant_metadata is stored for multi-turn context: provider selection,
    address/schedule updates, or booking selection.
    """

    save_ai_chat_exchange(
        current_user.id,
        request_data.message,
        response["answer"],
        response["intent"]["intent"],
        response["type"],
        request_metadata,
        response.get("assistant_metadata"),
        db,
    )
    response.pop("assistant_metadata", None)

    return response


def chat_request_payload(request_data: AIChatRequest) -> dict:
    return {
        "message": request_data.message,
        "service_province": request_data.service_province,
        "service_location_id": request_data.service_location_id,
        "service_address": getattr(request_data, "service_address", None),
        "max_price": request_data.max_price,
        "latitude": request_data.latitude,
        "longitude": request_data.longitude,
        "max_distance_km": request_data.max_distance_km,
        "scheduled_start_time": request_data.scheduled_start_time,
        "scheduled_end_time": request_data.scheduled_end_time,
        "candidate_provider_ids": request_data.candidate_provider_ids,
    }


def build_plain_answer_response(
    request_data: AIChatRequest,
    current_user: models.User,
    answer: str,
    request_metadata: dict,
    db: Session,
    *,
    response_type: str,
    intent_name: str,
    reason: str,
    extra: dict | None = None,
):
    intent = {
        "intent": intent_name,
        "confidence": 1,
        "reason": reason,
    }
    response = {
        **chat_request_payload(request_data),
        "type": response_type,
        "intent": intent,
        "answer": answer,
        "assistant_metadata": {
            "intent": intent,
            "answer_source": response_type,
        },
    }
    if extra:
        response.update(extra)
        response["assistant_metadata"].update(extra)
    return save_tool_calling_exchange(
        request_data,
        current_user,
        response,
        request_metadata,
        db,
    )


def try_handle_local_chat_fastpath(
    request_data: AIChatRequest,
    current_user: models.User,
    request_metadata: dict,
    db: Session,
):
    if looks_like_casual_greeting_only(request_data.message):
        return build_plain_answer_response(
            request_data,
            current_user,
            CASUAL_LOCAL_ANSWER,
            request_metadata,
            db,
            response_type="casual_chat",
            intent_name="casual_chat",
            reason="Local greeting fastpath",
        )

    return None


def get_missing_tool_arg_names(error_details):
    if not isinstance(error_details, list):
        return []

    missing_fields = []
    for error in error_details:
        if error.get("type") != "missing":
            continue
        location = error.get("loc") or []
        if location:
            missing_fields.append(str(location[-1]))

    return missing_fields


def get_invalid_tool_arg_names(error_details):
    if not isinstance(error_details, list):
        return []

    invalid_fields = []
    for error in error_details:
        if error.get("type") == "missing":
            continue
        location = error.get("loc") or []
        if location:
            invalid_fields.append(str(location[-1]))

    return invalid_fields


def build_tool_error_answer(tool_result: dict):
    tool_name = tool_result.get("tool_name")
    error_type = tool_result.get("error_type")
    status_code = tool_result.get("status_code")
    error = tool_result.get("error") or "Tool execution failed"

    if error_type == "validation_error":
        missing_fields = get_missing_tool_arg_names(tool_result.get("error_details"))
        if missing_fields:
            return format_tool_missing_fields_answer(missing_fields)

        invalid_fields = get_invalid_tool_arg_names(tool_result.get("error_details"))
        if invalid_fields:
            return format_tool_invalid_fields_answer(invalid_fields)

        return "Invalid parameters for this action. Check amount, time, and ID fields and try again."

    if status_code == 403:
        return "Your account does not have permission. Confirm you are logged in as the correct customer or provider."

    if status_code == 404:
        return f"I could not find the record: {error}. Check the booking or refund request ID."

    if status_code == 400:
        return f"This action cannot be performed now: {error}"

    if error_type == "tool_not_found":
        return f"AI selected a tool not available for your role: {tool_name}. Rephrase or check your account role."

    return f"Tool execution failed: {error}"


def build_tool_error_response_from_tool_result(
    request_data: AIChatRequest,
    current_user: models.User,
    tool_calling_result: dict,
    tool_result: dict,
    request_metadata: dict,
    db: Session,
):
    missing_fields = get_missing_tool_arg_names(tool_result.get("error_details"))
    answer = build_tool_error_answer(tool_result)
    response = {
        "message": request_data.message,
        "service_province": request_data.service_province,
        "service_address": request_data.service_address,
        "max_price": request_data.max_price,
        "latitude": request_data.latitude,
        "longitude": request_data.longitude,
        "max_distance_km": request_data.max_distance_km,
        "scheduled_start_time": request_data.scheduled_start_time,
        "scheduled_end_time": request_data.scheduled_end_time,
        "candidate_provider_ids": request_data.candidate_provider_ids,
        "type": "tool_error",
        "intent": {
            "intent": "tool_error",
            "confidence": 1,
            "reason": f"LangChain tool calling failed in {tool_result.get('tool_name')}",
        },
        "answer": answer,
        "tool_error": {
            "tool_name": tool_result.get("tool_name"),
            "tool_args": tool_result.get("tool_args", {}),
            "error": tool_result.get("error"),
            "error_code": tool_result.get("error_code"),
            "error_type": tool_result.get("error_type"),
            "status_code": tool_result.get("status_code"),
            "error_details": tool_result.get("error_details"),
        },
        "tool_calls": tool_calling_result.get("tool_calls", []),
        "tool_results": tool_calling_result.get("tool_results", []),
        "assistant_metadata": {
            "intent": {
                "intent": "tool_error",
                "confidence": 1,
                "reason": f"LangChain tool calling failed in {tool_result.get('tool_name')}",
            },
            "tool_name": tool_result.get("tool_name"),
            "tool_args": tool_result.get("tool_args", {}),
            "tool_error": tool_result,
            "model_answer": tool_calling_result.get("answer"),
            "answer_source": "backend_tool_error_answer",
        },
    }

    return save_tool_calling_exchange(
        request_data,
        current_user,
        response,
        request_metadata,
        db,
    )


def build_booking_draft_missing_info_answer(booking_draft: dict):
    missing_fields = booking_draft.get("missing_fields") or []
    provider_choices = booking_draft.get("provider_choices") or []
    next_question = booking_draft.get("next_question") or "Please continue providing booking details."

    answer_lines = ["I saved your booking request; I need one more detail before opening the booking form."]

    if missing_fields:
        missing_names = [field.get("name") for field in missing_fields]
        missing_labels = [
            get_tool_field_label(field.get("name") or field.get("label") or "")
            for field in missing_fields
        ]
        answer_lines.append(f"Still missing: {', '.join(missing_labels)}.")

        if "service_description" in missing_names:
            answer_lines.append(
                "Please describe the specific task you want this provider to complete."
            )
        else:
            answer_lines.append(next_question)

    if provider_choices and any(
        field.get("name") == "provider_profile_id" for field in missing_fields
    ):
        answer_lines.append("You can choose a provider below:")
        for index, provider in enumerate(provider_choices[:5], start=1):
            label = (
                provider.get("business_name")
                or f"Provider {provider.get('provider_id')}"
            )
            tags = provider.get("tags")
            hourly_rate = provider.get("hourly_rate")
            detail_parts = [f"{index}. {label}"]
            if provider.get("provider_id"):
                detail_parts.append(f"ID {provider['provider_id']}")
            if tags:
                detail_parts.append(str(tags))
            if hourly_rate is not None:
                detail_parts.append(f"${hourly_rate}/hr")
            answer_lines.append("，".join(detail_parts))

    if not missing_fields:
        answer_lines.append(next_question)

    return "\n".join(answer_lines)


def build_booking_draft_missing_info_response_from_tool_result(
    request_data: AIChatRequest,
    current_user: models.User,
    tool_calling_result: dict,
    tool_result: dict,
    request_metadata: dict,
    db: Session,
):
    booking_draft = tool_result["result"]
    answer = build_booking_draft_missing_info_answer(booking_draft)
    intent = {
        "intent": "create_booking",
        "confidence": 1,
        "reason": "LangChain tool calling chose prepare_booking_draft_action",
    }
    response = {
        "message": request_data.message,
        "service_province": request_data.service_province,
        "service_address": request_data.service_address,
        "max_price": request_data.max_price,
        "latitude": request_data.latitude,
        "longitude": request_data.longitude,
        "max_distance_km": request_data.max_distance_km,
        "scheduled_start_time": request_data.scheduled_start_time,
        "scheduled_end_time": request_data.scheduled_end_time,
        "candidate_provider_ids": request_data.candidate_provider_ids,
        "type": "booking_draft_missing_info",
        "intent": intent,
        "answer": answer,
        "booking_draft": booking_draft,
        "booking_draft_status": booking_draft.get("draft_status"),
        "booking_draft_preview": booking_draft.get("preview"),
        "missing_fields": booking_draft.get("missing_fields", []),
        "provider_choices": booking_draft.get("provider_choices", []),
        "next_question": booking_draft.get("next_question"),
        "tool_calls": tool_calling_result.get("tool_calls", []),
        "assistant_metadata": {
            "intent": intent,
            "tool_name": tool_result["tool_name"],
            "tool_args": tool_result.get("tool_args", {}),
            "booking_draft": booking_draft,
            "answer_source": "backend_booking_draft_answer",
        },
    }

    return save_tool_calling_exchange(
        request_data,
        current_user,
        response,
        request_metadata,
        db,
    )


def build_booking_form_ready_response_from_tool_result(
    request_data: AIChatRequest,
    current_user: models.User,
    tool_calling_result: dict,
    tool_result: dict,
    request_metadata: dict,
    db: Session,
):
    booking_form = tool_result["result"]
    intent = {
        "intent": "create_booking",
        "confidence": 1,
        "reason": "AI prepared the standard booking form",
    }
    response = {
        **chat_request_payload(request_data),
        "type": "booking_form_ready",
        "intent": intent,
        "answer": (
            "I polished your task description and opened the booking form. "
            "Please review it, choose the service and location, set the time, "
            "and submit the request yourself."
        ),
        "booking_form": booking_form,
        "tool_calls": tool_calling_result.get("tool_calls", []),
        "assistant_metadata": {
            "intent": intent,
            "tool_name": tool_result["tool_name"],
            "tool_args": tool_result.get("tool_args", {}),
            "booking_form": booking_form,
            "answer_source": "backend_booking_form_ready_answer",
        },
    }

    return save_tool_calling_exchange(
        request_data,
        current_user,
        response,
        request_metadata,
        db,
    )


def build_provider_search_answer(recommendations: dict):
    if recommendations.get("no_core_tag_matched"):
        return recommendations.get("message") or (
            "No clear service type matched; it may be other local services."
            "Try searching providers on the home page."
        )

    recommendation_count = recommendations.get("recommendation_count", 0)
    if recommendation_count <= 0:
        return "No matching providers found. Try different keywords or a service region."

    provider_names = [
        provider["business_name"]
        for provider in recommendations.get("recommendations", [])[:3]
        if provider.get("business_name")
    ]
    if provider_names:
        return (
            f"I found {recommendation_count} matching providers."
            f"Consider {', '.join(provider_names)} first."
            "Tap a card to open the provider profile."
        )

    return f"I found {recommendation_count} matching providers."


def build_provider_search_response_from_tool_result(
    request_data: AIChatRequest,
    current_user: models.User,
    tool_calling_result: dict,
    tool_result: dict,
    request_metadata: dict,
    db: Session,
):
    provider_search_result = tool_result["result"]
    resolved_need = provider_search_result["resolved_need"]
    recommendations = {
        key: value
        for key, value in provider_search_result.items()
        if key != "resolved_need"
    }
    recommended_provider_ids = [
        recommendation["provider_id"]
        for recommendation in recommendations["recommendations"]
    ]
    recommended_providers = build_provider_recommendation_snapshot(
        recommendations["recommendations"],
    )
    save_last_recommended_providers(
        current_user.id,
        recommended_provider_ids,
    )
    save_last_provider_recommendation_context(
        current_user.id,
        recommended_providers,
    )

    answer = tool_calling_result.get("answer") or build_provider_search_answer(
        recommendations
    )
    response = {
        "message": request_data.message,
        "service_province": request_data.service_province,
        "max_price": request_data.max_price,
        "latitude": request_data.latitude,
        "longitude": request_data.longitude,
        "max_distance_km": request_data.max_distance_km,
        "scheduled_start_time": request_data.scheduled_start_time,
        "scheduled_end_time": request_data.scheduled_end_time,
        "candidate_provider_ids": request_data.candidate_provider_ids,
        "type": (
            "provider_search_no_match"
            if recommendations.get("no_core_tag_matched")
            else "provider_search"
        ),
        "intent": {
            "intent": "provider_search",
            "confidence": 1,
            "reason": "LangChain tool calling chose search_providers",
        },
        "answer": answer,
        "extracted_need": resolved_need,
        "tool_calls": tool_calling_result.get("tool_calls", []),
        **recommendations,
        "assistant_metadata": {
            "intent": {
                "intent": "provider_search",
                "confidence": 1,
                "reason": "LangChain tool calling chose search_providers",
            },
            "tool_name": tool_result["tool_name"],
            "tool_args": tool_result.get("tool_args", {}),
            "extracted_need": resolved_need,
            "recommended_provider_ids": recommended_provider_ids,
            "recommended_providers": recommended_providers,
            "recommendation_count": recommendations["recommendation_count"],
            "no_core_tag_matched": recommendations.get("no_core_tag_matched"),
            "answer_source": "tool_message_final_answer",
        },
    }

    return save_tool_calling_exchange(
        request_data,
        current_user,
        response,
        request_metadata,
        db,
    )


def build_review_summary_response_from_tool_result(
    request_data: AIChatRequest,
    current_user: models.User,
    tool_calling_result: dict,
    tool_result: dict,
    request_metadata: dict,
    db: Session,
):
    summary_result = tool_result["result"]
    answer = tool_calling_result.get("answer") or summary_result["answer"]
    response = {
        "message": request_data.message,
        "service_province": request_data.service_province,
        "max_price": request_data.max_price,
        "latitude": request_data.latitude,
        "longitude": request_data.longitude,
        "max_distance_km": request_data.max_distance_km,
        "scheduled_start_time": request_data.scheduled_start_time,
        "scheduled_end_time": request_data.scheduled_end_time,
        "candidate_provider_ids": tool_result.get("tool_args", {}).get(
            "provider_ids",
            request_data.candidate_provider_ids,
        ),
        "type": "review_summary",
        "intent": {
            "intent": "review_summary",
            "confidence": 1,
            "reason": "LangChain tool calling chose summarize_provider_reviews",
        },
        "answer": answer,
        "review_context_source": summary_result["review_context_source"],
        "review_context": summary_result["review_context"],
        "tool_calls": tool_calling_result.get("tool_calls", []),
        "assistant_metadata": {
            "intent": {
                "intent": "review_summary",
                "confidence": 1,
                "reason": "LangChain tool calling chose summarize_provider_reviews",
            },
            "tool_name": tool_result["tool_name"],
            "tool_args": tool_result.get("tool_args", {}),
            "candidate_provider_ids": tool_result.get("tool_args", {}).get(
                "provider_ids",
                request_data.candidate_provider_ids,
            ),
            "review_context_source": summary_result["review_context_source"],
            "answer_source": "tool_message_final_answer",
        },
    }

    return save_tool_calling_exchange(
        request_data,
        current_user,
        response,
        request_metadata,
        db,
    )




def build_help_articles_response_from_tool_result(
    request_data: AIChatRequest,
    current_user: models.User,
    tool_calling_result: dict,
    tool_result: dict,
    request_metadata: dict,
    db: Session,
):
    result = tool_result["result"]
    intent = {
        "intent": "help_articles",
        "confidence": 1,
        "reason": "LangChain tool calling chose search_help_articles",
    }
    # Only what the app needs to link each answer into Help and Support.
    help_articles = [
        {"id": article["id"], "question": article["question"]}
        for article in result.get("articles", [])
    ]
    response = {
        "message": request_data.message,
        "service_province": request_data.service_province,
        "max_price": request_data.max_price,
        "latitude": request_data.latitude,
        "longitude": request_data.longitude,
        "max_distance_km": request_data.max_distance_km,
        "scheduled_start_time": request_data.scheduled_start_time,
        "scheduled_end_time": request_data.scheduled_end_time,
        "candidate_provider_ids": request_data.candidate_provider_ids,
        "type": "help_articles",
        "intent": intent,
        "answer": result.get("answer") or tool_calling_result.get("answer") or "",
        "help_articles": help_articles,
        "tool_calls": tool_calling_result.get("tool_calls", []),
        "assistant_metadata": {
            "intent": intent,
            "tool_name": tool_result["tool_name"],
            "tool_args": tool_result.get("tool_args", {}),
            "help_articles": help_articles,
            "answer_source": "help_articles_tool",
        },
    }

    return save_tool_calling_exchange(
        request_data,
        current_user,
        response,
        request_metadata,
        db,
    )




def format_confirmation_field_line(field: dict):
    label = field.get("label")
    value = field.get("value")
    if value is None or value == "":
        return None

    return f"{label}: {value}"


def build_ai_action_confirmation_answer(pending_action: dict):
    preview = pending_action.get("preview") or {}
    title = preview.get("title") or pending_action.get("summary") or "Confirm action"
    confirm_label = preview.get("confirm_label") or "Confirm"
    fields = preview.get("fields") or []
    field_lines = [
        line
        for line in (format_confirmation_field_line(field) for field in fields[:6])
        if line
    ]

    answer_lines = [
        f"I prepared this for you: {title}.",
        "Review the details below; nothing runs until you confirm.",
    ]
    if field_lines:
        answer_lines.extend(field_lines)

    warnings = pending_action.get("warnings") or []
    if warnings:
        answer_lines.append(f"Note: {warnings[0]}")

    answer_lines.append(f"When ready, tap {confirm_label} to continue.")

    return "\n".join(answer_lines)


def build_ai_action_confirmation_card(pending_action: dict):
    preview = pending_action.get("preview") or {}

    return {
        "ui_type": "confirmation_card",
        "action_id": pending_action["id"],
        "action_type": pending_action["action_type"],
        "title": preview.get("title") or pending_action["summary"],
        "description": pending_action["summary"],
        "status": pending_action["status"],
        "expires_at": pending_action["expires_at"],
        "fields": preview.get("fields", []),
        "provider": preview.get("provider"),
        "booking_id": preview.get("booking_id"),
        "refund_request_id": preview.get("refund_request_id"),
        "warnings": pending_action.get("warnings", []),
        "warning": preview.get("warning"),
        "confirm_label": preview.get("confirm_label", "Confirm"),
        "cancel_label": "Cancel",
        "confirm_endpoint": pending_action["confirm_endpoint"],
        "confirm_request": {
            "action_id": pending_action["id"],
        },
        "cancel_endpoint": pending_action["cancel_endpoint"],
    }


def build_ai_action_confirmation_response_from_tool_result(
    request_data: AIChatRequest,
    current_user: models.User,
    tool_calling_result: dict,
    tool_result: dict,
    request_metadata: dict,
    db: Session,
):
    pending_action = tool_result["result"]
    action_type = pending_action["action_type"]
    confirmation_card = build_ai_action_confirmation_card(pending_action)
    answer = build_ai_action_confirmation_answer(pending_action)
    response = {
        "message": request_data.message,
        "service_province": request_data.service_province,
        "max_price": request_data.max_price,
        "latitude": request_data.latitude,
        "longitude": request_data.longitude,
        "max_distance_km": request_data.max_distance_km,
        "scheduled_start_time": request_data.scheduled_start_time,
        "scheduled_end_time": request_data.scheduled_end_time,
        "candidate_provider_ids": request_data.candidate_provider_ids,
        "type": "ai_action_confirmation",
        "intent": {
            "intent": action_type,
            "confidence": 1,
            "reason": f"LangChain tool calling chose {tool_result['tool_name']}",
        },
        "answer": answer,
        "pending_action": pending_action,
        "confirmation_card": confirmation_card,
        "tool_calls": tool_calling_result.get("tool_calls", []),
        "assistant_metadata": {
            "intent": {
                "intent": action_type,
                "confidence": 1,
                "reason": f"LangChain tool calling chose {tool_result['tool_name']}",
            },
            "tool_name": tool_result["tool_name"],
            "tool_args": tool_result.get("tool_args", {}),
            "pending_action": pending_action,
            "model_answer": tool_calling_result.get("answer"),
            "confirmation_card": confirmation_card,
            "answer_source": "backend_confirmation_answer",
        },
    }

    return save_tool_calling_exchange(
        request_data,
        current_user,
        response,
        request_metadata,
        db,
    )


def parse_selection_index(message: str):
    normalized_message = message.strip().lower()
    digit_match = re.fullmatch(r"(?:number\s*)?(\d+)", normalized_message)
    if digit_match:
        return int(digit_match.group(1))

    loose_digit_match = re.search(
        r"(?:pick|choose|select|use|want|number)\s*(\d+)",
        normalized_message,
    )
    if loose_digit_match:
        return int(loose_digit_match.group(1))

    english_ordinals = {
        "first": 1,
        "second": 2,
        "third": 3,
        "fourth": 4,
        "fifth": 5,
    }
    for ordinal, index in english_ordinals.items():
        if re.search(rf"\b{ordinal}\b", normalized_message):
            return index

    chinese_index_match = re.search(
        r"第\s*(\d+|一|二|三|四|五)\s*(?:个)?",
        normalized_message,
    )
    if chinese_index_match:
        chinese_numbers = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5}
        value = chinese_index_match.group(1)
        return int(value) if value.isdigit() else chinese_numbers[value]

    return None


def booking_draft_needs_provider(booking_draft: dict | None):
    if not booking_draft:
        return False

    missing_field_names = booking_draft.get("missing_field_names") or []

    return "provider_profile_id" in missing_field_names


def get_booking_draft_provider_choices(
    booking_draft: dict | None,
    current_user: models.User,
    db: Session,
):
    if booking_draft:
        provider_choices = booking_draft.get("provider_choices") or []
        if provider_choices:
            return provider_choices

    return get_last_provider_recommendation_context(
        current_user.id
    ) or get_last_provider_recommendation_context_from_history(current_user.id, db)


def find_provider_choice(provider_choices: list[dict], selected_index: int):
    if selected_index < 1 or selected_index > len(provider_choices):
        return None

    return provider_choices[selected_index - 1]


def find_provider_choice_by_preference(message: str, provider_choices: list[dict]):
    if not provider_choices:
        return None

    normalized_message = message.strip().lower()

    if len(provider_choices) == 1 and normalized_message in [
        "this one",
        "this one",
        "this one",
    ]:
        return provider_choices[0]

    if any(
        keyword in normalized_message
        for keyword in ["highest rated", "best reviews", "best reputation"]
    ):
        return max(
            provider_choices,
            key=lambda provider: provider.get("average_rating") or 0,
        )

    if any(
        keyword in normalized_message for keyword in ["cheapest", "lowest price", "budget"]
    ):
        priced_providers = [
            provider
            for provider in provider_choices
            if provider.get("hourly_rate") is not None
        ]
        if priced_providers:
            return min(
                priced_providers,
                key=lambda provider: provider.get("hourly_rate"),
            )

    if any(
        keyword in normalized_message for keyword in ["best match", "first recommendation", "default"]
    ):
        return provider_choices[0]

    return None


def get_provider_profile_id_from_choice(provider_choice: dict | None):
    if not provider_choice:
        return None

    return provider_choice.get("provider_id") or provider_choice.get(
        "provider_profile_id"
    )


def has_active_booking_draft(booking_draft: dict | None):
    return bool(booking_draft and booking_draft.get("draft_type") == "create_booking")


def user_wants_to_clear_booking_draft(message: str):
    normalized_message = message.strip().lower()
    clear_keywords = [
        "cancel draft",
        "clear draft",
        "reset draft",
        "start over",
        "from scratch",
        "never mind",
        "forget it",
        "don't book",
        "cancel booking",
    ]

    return any(keyword in normalized_message for keyword in clear_keywords)


def build_booking_draft_cancelled_response(
    request_data: AIChatRequest,
    current_user: models.User,
    request_metadata: dict,
    db: Session,
):
    intent = {
        "intent": "cancel_booking_draft",
        "confidence": 1,
        "reason": "User asked to clear the current booking draft",
    }
    answer = "OK, I cleared the current booking draft. Describe a new service need anytime."
    response = {
        "message": request_data.message,
        "service_province": request_data.service_province,
        "service_address": request_data.service_address,
        "max_price": request_data.max_price,
        "latitude": request_data.latitude,
        "longitude": request_data.longitude,
        "max_distance_km": request_data.max_distance_km,
        "scheduled_start_time": request_data.scheduled_start_time,
        "scheduled_end_time": request_data.scheduled_end_time,
        "candidate_provider_ids": request_data.candidate_provider_ids,
        "type": "booking_draft_cancelled",
        "intent": intent,
        "answer": answer,
        "booking_draft": None,
        "booking_draft_status": "cancelled",
    }
    save_ai_chat_exchange(
        current_user.id,
        request_data.message,
        answer,
        intent["intent"],
        response["type"],
        request_metadata,
        {
            "intent": intent,
            "booking_draft": None,
            "booking_draft_status": "cancelled",
        },
        db,
    )

    return response


def booking_draft_needs_address_or_location(booking_draft: dict | None):
    if not has_active_booking_draft(booking_draft):
        return False

    missing_field_names = booking_draft.get("missing_field_names") or []

    return any(
        field_name in missing_field_names
        for field_name in [
            "service_address",
            "service_latitude",
            "service_longitude",
        ]
    )


def build_booking_draft_location_tool_args(request_data: AIChatRequest):
    tool_args = {}

    if request_data.service_address is not None:
        tool_args["service_address"] = request_data.service_address

    if request_data.latitude is not None and request_data.longitude is not None:
        tool_args["service_latitude"] = request_data.latitude
        tool_args["service_longitude"] = request_data.longitude

    return tool_args


def booking_draft_needs_schedule(booking_draft: dict | None):
    if not has_active_booking_draft(booking_draft):
        return False

    missing_field_names = booking_draft.get("missing_field_names") or []

    return any(
        field_name in missing_field_names
        for field_name in [
            "scheduled_start_time",
            "scheduled_end_time",
        ]
    )


def build_booking_draft_schedule_tool_args(request_data: AIChatRequest):
    tool_args = {}

    if request_data.scheduled_start_time is not None:
        tool_args["scheduled_start_time"] = (
            request_data.scheduled_start_time.isoformat()
        )

    if request_data.scheduled_end_time is not None:
        tool_args["scheduled_end_time"] = request_data.scheduled_end_time.isoformat()

    return tool_args


def should_try_booking_draft_text_update(message: str, booking_draft: dict | None):
    if not has_active_booking_draft(booking_draft):
        return False

    missing_field_names = booking_draft.get("missing_field_names") or []
    if not missing_field_names:
        return False

    if looks_like_review_summary_question(message):
        return False

    # Once a provider is selected, the very next free-text reply is the task
    # description. This also works for Chinese and other languages without a
    # brittle keyword list; cancellation is handled before this fast path.
    if "service_description" in missing_field_names:
        return bool(message.strip())

    normalized_message = message.strip().lower()
    return any(keyword in normalized_message for keyword in BOOKING_DRAFT_CONTINUATION_KEYWORDS)


def try_handle_booking_draft_text_update(
    request_data: AIChatRequest,
    current_user: models.User,
    request_metadata: dict,
    db: Session,
):
    if current_user.role != "customer":
        return None

    booking_draft = get_last_booking_draft_from_history(current_user.id, db)
    if not should_try_booking_draft_text_update(request_data.message, booking_draft):
        return None

    tool_calling_result = choose_and_run_langchain_tools(
        request_data.message,
        current_user,
        db,
        build_langchain_tool_context(request_data, current_user, db),
        allowed_tool_names=["prepare_booking_draft_action"],
        extra_system_prompt=BOOKING_DRAFT_CONTINUATION_PROMPT,
    )

    if tool_calling_result["type"] != "tool_call":
        return None

    return build_tool_calling_response_from_result(
        request_data,
        current_user,
        tool_calling_result,
        request_metadata,
        db,
    )


def build_tool_calling_response_from_result(
    request_data: AIChatRequest,
    current_user: models.User,
    tool_calling_result: dict,
    request_metadata: dict,
    db: Session,
):
    tool_result = get_successful_tool_result(tool_calling_result)
    if not tool_result:
        failed_tool_result = get_failed_tool_result(tool_calling_result)
        if failed_tool_result:
            return build_tool_error_response_from_tool_result(
                request_data,
                current_user,
                tool_calling_result,
                failed_tool_result,
                request_metadata,
                db,
            )

        return None

    if tool_result["tool_name"] == "search_providers":
        return build_provider_search_response_from_tool_result(
            request_data,
            current_user,
            tool_calling_result,
            tool_result,
            request_metadata,
            db,
        )

    if tool_result["tool_name"] == "summarize_provider_reviews":
        return build_review_summary_response_from_tool_result(
            request_data,
            current_user,
            tool_calling_result,
            tool_result,
            request_metadata,
            db,
        )

    if tool_result["tool_name"] == "search_help_articles":
        return build_help_articles_response_from_tool_result(
            request_data,
            current_user,
            tool_calling_result,
            tool_result,
            request_metadata,
            db,
        )

    if (
        tool_result["tool_name"] == "prepare_booking_draft_action"
        and tool_result.get("result", {}).get("draft_status") == "missing_info"
    ):
        return build_booking_draft_missing_info_response_from_tool_result(
            request_data,
            current_user,
            tool_calling_result,
            tool_result,
            request_metadata,
            db,
        )

    if (
        tool_result["tool_name"] == "prepare_booking_draft_action"
        and tool_result.get("result", {}).get("draft_status") == "ready_for_form"
    ):
        return build_booking_form_ready_response_from_tool_result(
            request_data,
            current_user,
            tool_calling_result,
            tool_result,
            request_metadata,
            db,
        )

    return None


def try_handle_booking_draft_provider_selection(
    request_data: AIChatRequest,
    current_user: models.User,
    request_metadata: dict,
    db: Session,
):
    if current_user.role != "customer":
        return None

    booking_draft = get_last_booking_draft_from_history(current_user.id, db)
    selected_index = parse_selection_index(request_data.message)
    if not has_active_booking_draft(booking_draft):
        return None

    provider_choices = get_booking_draft_provider_choices(
        booking_draft,
        current_user,
        db,
    )
    provider_choice = (
        find_provider_choice(provider_choices, selected_index)
        if selected_index is not None
        else find_provider_choice_by_preference(request_data.message, provider_choices)
    )
    provider_profile_id = get_provider_profile_id_from_choice(provider_choice)
    if provider_profile_id is None:
        return None

    context = build_langchain_tool_context(request_data, current_user, db)
    tool_args = {"provider_profile_id": provider_profile_id}
    tool_result = execute_langchain_tool_call(
        "prepare_booking_draft_action",
        tool_args,
        current_user,
        db,
        request_data.message,
        context,
    )
    tool_calling_result = {
        "message": request_data.message,
        "type": "tool_call",
        "answer": None,
        "tool_calls": [
            {
                "name": "prepare_booking_draft_action",
                "args": tool_args,
                "source": "booking_draft_provider_selection",
                "selected_index": selected_index,
                "selected_provider": provider_choice,
            }
        ],
        "tool_results": [tool_result],
    }

    return build_tool_calling_response_from_result(
        request_data,
        current_user,
        tool_calling_result,
        request_metadata,
        db,
    )


def try_handle_booking_draft_location_update(
    request_data: AIChatRequest,
    current_user: models.User,
    request_metadata: dict,
    db: Session,
):
    if current_user.role != "customer":
        return None

    booking_draft = get_last_booking_draft_from_history(current_user.id, db)
    if not has_active_booking_draft(booking_draft):
        return None

    tool_args = build_booking_draft_location_tool_args(request_data)
    if not tool_args:
        return None

    context = build_langchain_tool_context(request_data, current_user, db)
    tool_result = execute_langchain_tool_call(
        "prepare_booking_draft_action",
        tool_args,
        current_user,
        db,
        request_data.message,
        context,
    )
    tool_calling_result = {
        "message": request_data.message,
        "type": "tool_call",
        "answer": None,
        "tool_calls": [
            {
                "name": "prepare_booking_draft_action",
                "args": tool_args,
                "source": "booking_draft_location_update",
            }
        ],
        "tool_results": [tool_result],
    }

    return build_tool_calling_response_from_result(
        request_data,
        current_user,
        tool_calling_result,
        request_metadata,
        db,
    )


def try_handle_booking_draft_schedule_update(
    request_data: AIChatRequest,
    current_user: models.User,
    request_metadata: dict,
    db: Session,
):
    if current_user.role != "customer":
        return None

    booking_draft = get_last_booking_draft_from_history(current_user.id, db)
    if not has_active_booking_draft(booking_draft):
        return None

    tool_args = build_booking_draft_schedule_tool_args(request_data)
    if not tool_args:
        return None

    context = build_langchain_tool_context(request_data, current_user, db)
    tool_result = execute_langchain_tool_call(
        "prepare_booking_draft_action",
        tool_args,
        current_user,
        db,
        request_data.message,
        context,
    )
    tool_calling_result = {
        "message": request_data.message,
        "type": "tool_call",
        "answer": None,
        "tool_calls": [
            {
                "name": "prepare_booking_draft_action",
                "args": tool_args,
                "source": "booking_draft_schedule_update",
            }
        ],
        "tool_results": [tool_result],
    }

    return build_tool_calling_response_from_result(
        request_data,
        current_user,
        tool_calling_result,
        request_metadata,
        db,
    )


def try_handle_booking_draft_clear(
    request_data: AIChatRequest,
    current_user: models.User,
    request_metadata: dict,
    db: Session,
):
    if current_user.role != "customer":
        return None

    booking_draft = get_last_booking_draft_from_history(current_user.id, db)
    if not has_active_booking_draft(booking_draft):
        return None

    if not user_wants_to_clear_booking_draft(request_data.message):
        return None

    return build_booking_draft_cancelled_response(
        request_data,
        current_user,
        request_metadata,
        db,
    )


def try_handle_with_langchain_tool_calling(
    request_data: AIChatRequest,
    current_user: models.User,
    request_metadata: dict,
    db: Session,
):
    tool_calling_result = choose_and_run_langchain_tools(
        request_data.message,
        current_user,
        db,
        build_langchain_tool_context(request_data, current_user, db),
    )

    if tool_calling_result["type"] == "tool_call":
        return build_tool_calling_response_from_result(
            request_data,
            current_user,
            tool_calling_result,
            request_metadata,
            db,
        )

    answer = (tool_calling_result.get("answer") or "").strip()
    if answer and not answer.startswith("No suitable capability found"):
        return build_plain_answer_response(
            request_data,
            current_user,
            answer,
            request_metadata,
            db,
            response_type="answer",
            intent_name="tool_calling",
            reason="Model replied without choosing a tool",
        )

    return None


def handle_ai_chat_request(
    request_data: AIChatRequest,
    current_user: models.User,
    db: Session,
):
    request_metadata = build_ai_chat_request_metadata(request_data)
    booking_draft_clear_response = try_handle_booking_draft_clear(
        request_data,
        current_user,
        request_metadata,
        db,
    )
    if booking_draft_clear_response:
        return booking_draft_clear_response

    booking_draft_provider_selection_response = (
        try_handle_booking_draft_provider_selection(
            request_data,
            current_user,
            request_metadata,
            db,
        )
    )
    if booking_draft_provider_selection_response:
        return booking_draft_provider_selection_response

    booking_draft_text_update_response = try_handle_booking_draft_text_update(
        request_data,
        current_user,
        request_metadata,
        db,
    )
    if booking_draft_text_update_response:
        return booking_draft_text_update_response

    local_response = try_handle_local_chat_fastpath(
        request_data,
        current_user,
        request_metadata,
        db,
    )
    if local_response:
        return local_response

    tool_calling_response = try_handle_with_langchain_tool_calling(
        request_data,
        current_user,
        request_metadata,
        db,
    )
    if tool_calling_response:
        return tool_calling_response

    return handle_rule_based_chat_fallback(
        request_data,
        current_user,
        request_metadata,
        db,
    )


def handle_rule_based_chat_fallback(
    request_data: AIChatRequest,
    current_user: models.User,
    request_metadata: dict,
    db: Session,
):
    fallback_need = parse_user_service_need(request_data.message)
    if fallback_need["matched_tags"]:
        extracted_need = {
            "service_tags": fallback_need["matched_tags"],
            "service_province": None,
            "max_price": None,
            "budget_preference": fallback_need["budget_preference"],
            "quality_preference": False,
            "urgency": None,
        }
        service_province = request_data.service_province
        max_price = request_data.max_price
        scheduled_start_time = request_data.scheduled_start_time
        scheduled_end_time = request_data.scheduled_end_time
        provider_search_result = search_providers_tool(
            query=request_data.message,
            service_tags=extracted_need["service_tags"],
            service_province=service_province,
            max_price=max_price,
            budget_preference=extracted_need["budget_preference"],
            current_user=current_user,
            db=db,
            latitude=request_data.latitude,
            longitude=request_data.longitude,
            max_distance_km=request_data.max_distance_km,
            scheduled_start_time=scheduled_start_time,
            scheduled_end_time=scheduled_end_time,
            limit=5,
            service_location_id=request_data.service_location_id,
        )
        recommendations = {
            key: value
            for key, value in provider_search_result.items()
            if key != "resolved_need"
        }
        resolved_need = provider_search_result["resolved_need"]
        extracted_need.update(resolved_need)
        recommended_provider_ids = [
            recommendation["provider_id"]
            for recommendation in recommendations["recommendations"]
        ]
        recommended_providers = build_provider_recommendation_snapshot(
            recommendations["recommendations"],
        )
        save_last_recommended_providers(current_user.id, recommended_provider_ids)
        save_last_provider_recommendation_context(
            current_user.id,
            recommended_providers,
        )
        intent = {
            "intent": "provider_search",
            "confidence": 0.7,
            "reason": "Rule fallback matched service tags",
        }
        answer = build_provider_search_answer(recommendations)
        response = {
            **chat_request_payload(request_data),
            "type": (
                "provider_search_no_match"
                if recommendations.get("no_core_tag_matched")
                else "provider_search"
            ),
            "intent": intent,
            "answer": answer,
            "extracted_need": extracted_need,
            **recommendations,
            "assistant_metadata": {
                "intent": intent,
                "extracted_need": extracted_need,
                "recommended_provider_ids": recommended_provider_ids,
                "recommended_providers": recommended_providers,
                "recommendation_count": recommendations["recommendation_count"],
                "no_core_tag_matched": recommendations.get("no_core_tag_matched"),
                "answer_source": "rule_fallback_provider_search",
            },
        }
        return save_tool_calling_exchange(
            request_data,
            current_user,
            response,
            request_metadata,
            db,
        )

    if looks_like_review_summary_question(request_data.message):
        recent_provider_ids = get_last_recommended_providers(current_user.id)
        history_provider_ids = get_last_recommended_provider_ids_from_history(
            current_user.id,
            db,
        )
        candidate_provider_ids = resolve_candidate_provider_ids(
            request_data.candidate_provider_ids,
            recent_provider_ids,
            history_provider_ids,
        )
        intent = {
            "intent": "review_summary",
            "confidence": 0.7,
            "reason": "Rule fallback matched review summary question",
        }
        if not candidate_provider_ids:
            return build_plain_answer_response(
                request_data,
                current_user,
                "Please select or recommend a few providers first, then I can summarize reviews, price, and attitude.",
                request_metadata,
                db,
                response_type="review_summary",
                intent_name="review_summary",
                reason=intent["reason"],
            )

        review_summary_result = summarize_provider_reviews_tool(
            question=request_data.message,
            provider_ids=candidate_provider_ids,
            current_user=current_user,
            db=db,
        )
        response = {
            **chat_request_payload(request_data),
            "candidate_provider_ids": candidate_provider_ids,
            "type": "review_summary",
            "intent": intent,
            "answer": review_summary_result["answer"],
            "review_context_source": review_summary_result["review_context_source"],
            "review_context": review_summary_result["review_context"],
            "assistant_metadata": {
                "intent": intent,
                "candidate_provider_ids": candidate_provider_ids,
                "review_context_source": review_summary_result["review_context_source"],
                "answer_source": "rule_fallback_review_summary",
            },
        }
        return save_tool_calling_exchange(
            request_data,
            current_user,
            response,
            request_metadata,
            db,
        )

    return build_plain_answer_response(
        request_data,
        current_user,
        "I did not quite understand. Describe the service you need, or select providers for a review summary.",
        request_metadata,
        db,
        response_type="unknown",
        intent_name="unknown",
        reason="No tool and no rule fallback matched",
    )

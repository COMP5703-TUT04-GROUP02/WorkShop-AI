"""Pending confirmation support for AI-assisted booking creation."""

import json
from datetime import timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend import models
from backend.schemas import AIPendingActionStatus
from backend.core.clock import parse_dt, utc_now
from backend.core.serialize import jsonable

AI_PENDING_ACTION_EXPIRE_MINUTES = 30
SUPPORTED_AI_ACTION_TYPE = "create_booking"


def dump_json(data: Any):
    return json.dumps(jsonable(data), ensure_ascii=False)


def load_json(data: str | None, default: Any = None):
    if not data:
        return default

    return json.loads(data)


def parse_iso_datetime(value):
    parsed = parse_dt(value)
    if parsed is None:
        raise ValueError("invalid datetime")
    return parsed


def format_provider_preview(provider: models.ProviderProfile | None):
    if not provider:
        return None

    return {
        "id": provider.id,
        "business_name": provider.business_name,
        "service_province": provider.service_province,
        "hourly_rate": provider.hourly_rate,
        "verification_status": provider.verification_status,
    }


def build_field(label: str, value: Any):
    return {
        "label": label,
        "value": value,
    }


def build_ai_pending_action_preview(
    action: models.AIPendingAction,
    payload: dict,
    db: Session | None = None,
):
    action_type = action.action_type
    preview = {
        "title": action.summary,
        "action_type": action_type,
        "confirm_label": "Confirm",
        "fields": [],
    }

    if action_type == "create_booking":
        provider = None
        if db is not None:
            provider = (
                db.query(models.ProviderProfile)
                .filter(models.ProviderProfile.id == payload.get("provider_profile_id"))
                .first()
            )

        preview.update(
            {
                "title": "Confirm create booking",
                "confirm_label": "Confirm send booking request",
                "provider": format_provider_preview(provider),
                "fields": [
                    build_field(
                        "Provider",
                        (
                            provider.business_name
                            if provider
                            else payload.get("provider_profile_id")
                        ),
                    ),
                    build_field("Service description", payload.get("service_description")),
                    build_field("Service address", payload.get("service_address")),
                    build_field("Start time", payload.get("scheduled_start_time")),
                    build_field("End time", payload.get("scheduled_end_time")),
                ],
            }
        )
        return preview

    preview["warning"] = "This AI action type is no longer supported."
    return preview


def format_ai_pending_action(
    action: models.AIPendingAction,
    db: Session | None = None,
):
    payload = load_json(action.payload_json, {})

    return {
        "id": action.id,
        "user_id": action.user_id,
        "action_type": action.action_type,
        "payload": payload,
        "summary": action.summary,
        "warnings": load_json(action.warnings_json, []),
        "preview": build_ai_pending_action_preview(action, payload, db),
        "status": action.status,
        "created_at": action.created_at,
        "expires_at": action.expires_at,
        "executed_at": action.executed_at,
        "confirm_endpoint": "/ai/actions/confirm",
        "cancel_endpoint": f"/ai/actions/{action.id}/cancel",
    }


def create_ai_pending_action(
    user_id: int,
    action_type: str,
    payload: dict,
    summary: str,
    warnings: list[str] | None,
    db: Session,
):
    if action_type != SUPPORTED_AI_ACTION_TYPE:
        raise HTTPException(status_code=400, detail="Unsupported AI action type")

    now = utc_now()
    action = models.AIPendingAction(
        user_id=user_id,
        action_type=action_type,
        payload_json=dump_json(payload),
        summary=summary,
        warnings_json=dump_json(warnings or []),
        status=AIPendingActionStatus.pending,
        created_at=now,
        expires_at=now + timedelta(minutes=AI_PENDING_ACTION_EXPIRE_MINUTES),
        executed_at=None,
    )
    db.add(action)
    db.commit()
    db.refresh(action)

    return format_ai_pending_action(action, db)


def get_ai_pending_action_or_404(
    action_id: int,
    current_user: models.User,
    db: Session,
):
    action = (
        db.query(models.AIPendingAction)
        .filter(
            models.AIPendingAction.id == action_id,
            models.AIPendingAction.user_id == current_user.id,
        )
        .first()
    )

    if not action:
        raise HTTPException(status_code=404, detail="AI pending action not found")

    return action


def is_ai_pending_action_expired(action: models.AIPendingAction):
    return parse_iso_datetime(action.expires_at) <= utc_now()


def refresh_ai_pending_action_expiration(
    action: models.AIPendingAction,
    db: Session,
):
    if action.status == AIPendingActionStatus.pending and is_ai_pending_action_expired(
        action
    ):
        action.status = AIPendingActionStatus.expired
        db.commit()
        db.refresh(action)

    return action


def expire_user_pending_actions(user_id: int, db: Session):
    actions = (
        db.query(models.AIPendingAction)
        .filter(
            models.AIPendingAction.user_id == user_id,
            models.AIPendingAction.status == AIPendingActionStatus.pending,
        )
        .all()
    )
    expired_count = 0

    for action in actions:
        if is_ai_pending_action_expired(action):
            action.status = AIPendingActionStatus.expired
            expired_count += 1

    if expired_count:
        db.commit()

    return expired_count


def get_confirmable_ai_pending_action(
    action_id: int,
    current_user: models.User,
    db: Session,
):
    action = get_ai_pending_action_or_404(action_id, current_user, db)
    action = refresh_ai_pending_action_expiration(action, db)

    if action.status != AIPendingActionStatus.pending:
        raise HTTPException(
            status_code=400,
            detail="AI pending action is not pending",
        )

    return action


def cancel_ai_pending_action(
    action_id: int,
    current_user: models.User,
    db: Session,
):
    action = get_ai_pending_action_or_404(action_id, current_user, db)
    action = refresh_ai_pending_action_expiration(action, db)

    if action.status != AIPendingActionStatus.pending:
        raise HTTPException(
            status_code=400,
            detail="Only pending AI actions can be cancelled",
        )

    action.status = AIPendingActionStatus.cancelled
    db.commit()
    db.refresh(action)

    return format_ai_pending_action(action, db)


def mark_ai_pending_action_executed(
    action: models.AIPendingAction,
    db: Session,
):
    action.status = AIPendingActionStatus.executed
    action.executed_at = utc_now()
    db.commit()
    db.refresh(action)

    return format_ai_pending_action(action, db)

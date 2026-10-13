"""Business logic for provider recommendations, FAQs, bookings, and review comparison."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend import models
from backend.services.ai_service import (
    generate_embedding,
    summarize_provider_reviews as summarize_reviews_with_model,
)
from backend.services.milvus_service import search_review_embeddings
from backend.utils.ai import (
    build_provider_review_context,
    build_provider_recommendations,
    enrich_review_context_with_provider_info,
    has_review_context,
    normalize_ai_recommendation_tags,
)
from backend.utils.ai_pending_action import format_provider_preview
from backend.utils.location import has_location
from backend.utils.provider_eligibility import require_provider_can_accept_orders
from backend.utils.service_locations import resolve_location_context
from backend.services.faq_service import get_faq_items, search_faq



HELP_ARTICLE_NOT_FOUND_ANSWER = (
    "I could not find a help article for that. You can browse every answer "
    "under Account > Help and Support."
)


def search_help_articles_tool(query: str = "", faq_ids: list[str] | None = None):
    """Answer with the best FAQ match verbatim.

    The model picks faq_ids from the catalog in the tool description, which
    handles any language and paraphrase; keyword search on query is only the
    fallback when it picks none (or only unknown ids). Every match, the best
    one first, is returned in articles; the app links them into Help.
    """
    articles = get_faq_items("customer", faq_ids or [])[:3] or search_faq(
        "customer", query
    )
    if not articles:
        return {"query": query, "articles": [], "answer": HELP_ARTICLE_NOT_FOUND_ANSWER}

    best = articles[0]
    return {
        "query": query,
        "articles": articles,
        "answer": f"**{best['question']}**\n\n{best['answer']}",
    }
def get_customer_profile_for_ai_tool(current_user: models.User, db: Session):
    if current_user.role != "customer":
        return None

    return (
        db.query(models.CustomerProfile)
        .filter(models.CustomerProfile.user_id == current_user.id)
        .first()
    )


def search_providers_tool(
    query: str,
    service_tags: list[str],
    service_province: str | None,
    max_price: float | None,
    budget_preference: str | None,
    current_user: models.User | None,
    db: Session,
    latitude: float | None = None,
    longitude: float | None = None,
    max_distance_km: float | None = None,
    scheduled_start_time=None,
    scheduled_end_time=None,
    limit: int | None = 5,
    service_location_id: int | None = None,
):
    normalized_service_tags = normalize_ai_recommendation_tags(
        service_tags,
        query,
    )

    if not normalized_service_tags:
        return {
            "resolved_need": {
                "service_tags": [],
                "service_province": service_province,
                "service_location_id": service_location_id,
                "max_price": max_price,
                "budget_preference": budget_preference,
                "latitude": latitude,
                "longitude": longitude,
                "max_distance_km": max_distance_km,
                "scheduled_start_time": (
                    scheduled_start_time.isoformat()
                    if scheduled_start_time
                    else None
                ),
                "scheduled_end_time": (
                    scheduled_end_time.isoformat() if scheduled_end_time else None
                ),
            },
            "query": query,
            "service_province": service_province,
            "service_location_id": service_location_id,
            "max_price": max_price,
            "latitude": latitude,
            "longitude": longitude,
            "max_distance_km": max_distance_km,
            "scheduled_start_time": (
                scheduled_start_time.isoformat() if scheduled_start_time else None
            ),
            "scheduled_end_time": (
                scheduled_end_time.isoformat() if scheduled_end_time else None
            ),
            "recommendation_count": 0,
            "recommendations": [],
            "no_core_tag_matched": True,
            "message": (
                "No clear service type matched; it may be other local services."
                "Try searching providers on the home page."
            ),
        }

    customer_profile = (
        get_customer_profile_for_ai_tool(current_user, db) if current_user else None
    )

    resolved_service_province, resolved_service_location_id = resolve_location_context(
        db,
        requested_province=service_province,
        requested_location_id=service_location_id,
        profile_province=(
            customer_profile.service_province if customer_profile else None
        ),
        profile_location_id=(
            customer_profile.service_location_id if customer_profile else None
        ),
    )
    resolved_latitude = (
        latitude
        if latitude is not None
        else (customer_profile.latitude if customer_profile else None)
    )
    resolved_longitude = (
        longitude
        if longitude is not None
        else (customer_profile.longitude if customer_profile else None)
    )

    if max_distance_km is not None and not has_location(
        resolved_latitude,
        resolved_longitude,
    ):
        raise HTTPException(
            status_code=400,
            detail="max_distance_km requires latitude and longitude",
        )

    recommendations = build_provider_recommendations(
        query,
        normalized_service_tags,
        resolved_service_province,
        max_price,
        budget_preference,
        db,
        latitude=resolved_latitude,
        longitude=resolved_longitude,
        max_distance_km=max_distance_km,
        scheduled_start_time=scheduled_start_time,
        scheduled_end_time=scheduled_end_time,
        limit=limit,
        service_location_id=resolved_service_location_id,
    )

    return {
        "resolved_need": {
            "service_tags": normalized_service_tags,
            "normalized_service_tags": normalized_service_tags,
            "service_province": resolved_service_province,
            "service_location_id": resolved_service_location_id,
            "max_price": max_price,
            "budget_preference": budget_preference,
            "latitude": resolved_latitude,
            "longitude": resolved_longitude,
            "max_distance_km": max_distance_km,
            "scheduled_start_time": (
                scheduled_start_time.isoformat() if scheduled_start_time else None
            ),
            "scheduled_end_time": (
                scheduled_end_time.isoformat() if scheduled_end_time else None
            ),
        },
        **recommendations,
    }


def summarize_provider_reviews_tool(
    question: str,
    provider_ids: list[int],
    current_user: models.User,
    db: Session,
):
    review_context_source = "milvus"

    try:
        query_embedding = generate_embedding(question)
        review_context = search_review_embeddings(query_embedding, provider_ids)
        review_context = enrich_review_context_with_provider_info(review_context, db)

        if not has_review_context(review_context):
            review_context_source = "sqlite"
            review_context = build_provider_review_context(provider_ids, db)
    except Exception:
        review_context_source = "sqlite"
        review_context = build_provider_review_context(provider_ids, db)

    try:
        answer = summarize_reviews_with_model(question, review_context)
    except Exception:
        answer = build_review_summary_fallback(question, review_context)

    return {
        "answer": answer,
        "review_context_source": review_context_source,
        "review_context": review_context,
    }


def build_review_summary_fallback(question: str, review_context: list[dict]):
    """Return a useful grounded comparison when the summary model is unavailable."""

    if not review_context:
        return (
            "没有找到这些商家的可见评价。"
            if any("\u4e00" <= character <= "\u9fff" for character in question)
            else "I could not find visible reviews for these providers."
        )

    ranked = sorted(
        review_context,
        key=lambda item: (
            item.get("average_rating") or 0,
            item.get("review_count") or 0,
            item.get("completed_bookings") or 0,
            -(item.get("hourly_rate") or float("inf")),
        ),
        reverse=True,
    )
    best = ranked[0]
    name = best.get("business_name") or best.get("provider_name") or "The first provider"
    rating = best.get("average_rating") or 0
    review_count = best.get("review_count") or 0
    completed = best.get("completed_bookings") or 0
    hourly_rate = best.get("hourly_rate")
    negative_count = len(best.get("negative_reviews") or [])
    is_chinese = any("\u4e00" <= character <= "\u9fff" for character in question)

    if is_chinese:
        price_text = f"，参考价格为 TRY {hourly_rate}/小时" if hourly_rate is not None else ""
        risk_text = (
            f"；相关检索中也有 {negative_count} 条负面评价，建议下单前查看详情"
            if negative_count
            else "；相关检索中没有发现负面评价"
        )
        return (
            f"根据当前可见评价，{name} 的综合表现最好：平均 {rating}/5，"
            f"共 {review_count} 条评价，已完成 {completed} 个订单{price_text}{risk_text}。"
        )

    price_text = f", with a reference price of TRY {hourly_rate}/hr" if hourly_rate is not None else ""
    risk_text = (
        f" The retrieved context also contains {negative_count} negative review(s), so check the details before booking."
        if negative_count
        else " No negative reviews appeared in the retrieved context."
    )
    return (
        f"Based on the visible reviews, {name} has the strongest overall record: "
        f"{rating}/5 from {review_count} review(s) and {completed} completed booking(s)"
        f"{price_text}.{risk_text}"
    )




def ensure_current_user_is_customer(current_user: models.User):
    if current_user.role != "customer":
        raise HTTPException(
            status_code=403, detail="Only customers can use this action"
        )




BOOKING_DRAFT_FIELD_CONFIG = {
    "provider_profile_id": {
        "label": "Provider",
        "type": "integer",
        "question": "Which provider would you like to book? Reply with a list number or provider profile id.",
    },
    "service_description": {
        "label": "Service description",
        "type": "string",
        "question": "Please describe the specific task you want this provider to complete.",
    },
}

BOOKING_DRAFT_REQUIRED_FIELDS = list(BOOKING_DRAFT_FIELD_CONFIG.keys())


def is_missing_booking_draft_value(value):
    return value is None or (isinstance(value, str) and not value.strip())


def merge_booking_draft_fields(existing_draft: dict | None, new_fields: dict):
    draft = {}

    if existing_draft:
        draft.update(existing_draft.get("provided_fields") or existing_draft)

    for key, value in new_fields.items():
        if not is_missing_booking_draft_value(value):
            draft[key] = value

    return draft


def format_booking_draft_missing_field(field_name: str):
    config = BOOKING_DRAFT_FIELD_CONFIG[field_name]

    return {
        "name": field_name,
        "label": config["label"],
        "type": config["type"],
        "question": config["question"],
    }


def format_booking_draft_provider_preview(provider_profile_id: int | None, db: Session):
    if provider_profile_id is None:
        return None

    provider = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == provider_profile_id)
        .first()
    )

    return format_provider_preview(provider)


def build_booking_draft_preview(
    draft: dict, missing_field_names: list[str], db: Session
):
    fields = []
    field_labels = {
        field_name: config["label"]
        for field_name, config in BOOKING_DRAFT_FIELD_CONFIG.items()
    }

    for field_name in BOOKING_DRAFT_REQUIRED_FIELDS:
        value = draft.get(field_name)
        fields.append(
            {
                "name": field_name,
                "label": field_labels[field_name],
                "value": value,
                "filled": not is_missing_booking_draft_value(value),
                "missing": field_name in missing_field_names,
            }
        )

    return {
        "ui_type": "booking_draft_preview",
        "title": "Booking draft",
        "draft_type": "create_booking",
        "provider": format_booking_draft_provider_preview(
            draft.get("provider_profile_id"),
            db,
        ),
        "fields": fields,
        "missing_field_names": missing_field_names,
        "ready_to_confirm": len(missing_field_names) == 0,
    }


def build_booking_draft_missing_info_response(
    draft: dict,
    missing_field_names: list[str],
    db: Session,
    provider_choices: list[dict] | None = None,
):
    next_field_name = missing_field_names[0]

    return {
        "draft_status": "missing_info",
        "draft_type": "create_booking",
        "provided_fields": draft,
        "missing_field_names": missing_field_names,
        "missing_fields": [
            format_booking_draft_missing_field(field_name)
            for field_name in missing_field_names
        ],
        "provider_choices": provider_choices or [],
        "preview": build_booking_draft_preview(draft, missing_field_names, db),
        "next_question": BOOKING_DRAFT_FIELD_CONFIG[next_field_name]["question"],
    }


def prepare_booking_draft_action_tool(
    current_user: models.User,
    db: Session,
    provider_profile_id: int | None = None,
    service_description: str | None = None,
    existing_draft: dict | None = None,
    provider_choices: list[dict] | None = None,
):
    ensure_current_user_is_customer(current_user)
    draft = merge_booking_draft_fields(
        existing_draft,
        {
            "provider_profile_id": provider_profile_id,
            "service_description": service_description,
        },
    )
    missing_field_names = [
        field_name
        for field_name in BOOKING_DRAFT_REQUIRED_FIELDS
        if is_missing_booking_draft_value(draft.get(field_name))
    ]

    if missing_field_names:
        return build_booking_draft_missing_info_response(
            draft,
            missing_field_names,
            db,
            provider_choices,
        )

    provider_profile = (
        db.query(models.ProviderProfile)
        .filter(models.ProviderProfile.id == draft["provider_profile_id"])
        .first()
    )
    if not provider_profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    require_provider_can_accept_orders(provider_profile, db)

    polished_description = str(draft["service_description"]).strip()
    title = " ".join(polished_description.split()[:10])
    return {
        "draft_status": "ready_for_form",
        "draft_type": "create_booking",
        "provider_profile_id": provider_profile.id,
        "provider": format_provider_preview(provider_profile),
        "form_defaults": {
            "title": title,
            "service_description": polished_description,
        },
    }

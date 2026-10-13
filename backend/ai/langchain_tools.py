"""The four customer-facing tools available to Workshop AI chat."""

from datetime import datetime
from typing import Any

from fastapi.encoders import jsonable_encoder
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import models
from backend.ai.tools import (
    prepare_booking_draft_action_tool,
    search_help_articles_tool,
    search_providers_tool,
    summarize_provider_reviews_tool,
)
from backend.constants import AI_RECOMMENDATION_PROVIDER_TAGS
from backend.services.faq_service import faq_catalog
from backend.services.redis_service import get_last_provider_recommendation_context
from backend.utils.ai_chat import (
    get_last_booking_draft_from_history,
    get_last_provider_recommendation_context_from_history,
)


def parse_optional_datetime(value: str | None):
    if not value:
        return None
    return datetime.fromisoformat(value)


class SearchProvidersToolInput(BaseModel):
    query: str = Field(description="User service need, e.g. kitchen pipe leak")
    service_tags: list[str] = Field(
        default_factory=list,
        description=(
            "Service tags; choose only from core tags: "
            f"{', '.join(AI_RECOMMENDATION_PROVIDER_TAGS)}. "
            "Return an empty array if none match; do not output synonyms."
        ),
    )
    service_province: str | None = Field(default=None, description="Service province/region")
    service_location_id: int | None = Field(
        default=None,
        description="Selected province, city, or district location ID",
    )
    max_price: float | None = Field(default=None, description="Maximum budget")
    budget_preference: str | None = Field(
        default=None,
        description="Price preference: cheap, quality, balanced, or null",
    )
    latitude: float | None = Field(default=None, description="Service latitude")
    longitude: float | None = Field(default=None, description="Service longitude")
    max_distance_km: float | None = Field(default=None, description="Max distance in km")
    scheduled_start_time: str | None = Field(
        default=None,
        description="Appointment start time, ISO string",
    )
    scheduled_end_time: str | None = Field(
        default=None,
        description="Appointment end time, ISO string",
    )
    limit: int | None = Field(default=5, description="Max providers to return")


class SearchHelpArticlesToolInput(BaseModel):
    faq_ids: list[str] = Field(
        default_factory=list,
        description=(
            "IDs from the help catalog that answer the question, best match first, "
            "at most 3. Leave empty if none fits."
        ),
    )
    query: str = Field(
        default="",
        description="The customer's question as a short English phrase.",
    )


class SummarizeProviderReviewsToolInput(BaseModel):
    question: str = Field(
        description="Question comparing provider reviews, price, attitude, or reputation"
    )
    provider_ids: list[int] = Field(
        description="Provider profile IDs to compare from reviews"
    )


class PrepareBookingDraftActionToolInput(BaseModel):
    provider_profile_id: int | None = Field(default=None, description="Provider profile ID")
    service_description: str | None = Field(
        default=None,
        description=(
            "A concise, professional rewrite of the customer's task description in "
            "the customer's language. Preserve facts and never add requirements."
        ),
    )


def build_langchain_tools(current_user: models.User, db: Session):
    """Return only the four supported tools, and only for customers."""
    if current_user.role != "customer":
        return []

    def search_providers(
        query: str,
        service_tags: list[str] | None = None,
        service_province: str | None = None,
        service_location_id: int | None = None,
        max_price: float | None = None,
        budget_preference: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        max_distance_km: float | None = None,
        scheduled_start_time: str | None = None,
        scheduled_end_time: str | None = None,
        limit: int | None = 5,
    ):
        return jsonable_encoder(
            search_providers_tool(
                query=query,
                service_tags=service_tags or [],
                service_province=service_province,
                service_location_id=service_location_id,
                max_price=max_price,
                budget_preference=budget_preference,
                current_user=current_user,
                db=db,
                latitude=latitude,
                longitude=longitude,
                max_distance_km=max_distance_km,
                scheduled_start_time=parse_optional_datetime(scheduled_start_time),
                scheduled_end_time=parse_optional_datetime(scheduled_end_time),
                limit=limit,
            )
        )

    def search_help_articles(query: str = "", faq_ids: list[str] | None = None):
        return jsonable_encoder(search_help_articles_tool(query=query, faq_ids=faq_ids))

    def summarize_provider_reviews(question: str, provider_ids: list[int]):
        return jsonable_encoder(
            summarize_provider_reviews_tool(
                question=question,
                provider_ids=provider_ids,
                current_user=current_user,
                db=db,
            )
        )

    def prepare_booking_draft_action(
        provider_profile_id: int | None = None,
        service_description: str | None = None,
    ):
        return jsonable_encoder(
            prepare_booking_draft_action_tool(
                provider_profile_id=provider_profile_id,
                service_description=service_description,
                current_user=current_user,
                db=db,
                existing_draft=get_last_booking_draft_from_history(current_user.id, db),
                provider_choices=(
                    get_last_provider_recommendation_context(current_user.id)
                    or get_last_provider_recommendation_context_from_history(
                        current_user.id, db
                    )
                ),
            )
        )

    return [
        StructuredTool.from_function(
            func=search_providers,
            name="search_providers",
            description="Recommend local providers by service, region, budget, location, and schedule.",
            args_schema=SearchProvidersToolInput,
        ),
        StructuredTool.from_function(
            func=search_help_articles,
            name="search_help_articles",
            description=(
                "Answer customer FAQ and policy questions. Pick faq_ids by meaning "
                "from this catalog, whatever language the customer uses:\n"
                + faq_catalog("customer")
            ),
            args_schema=SearchHelpArticlesToolInput,
        ),
        StructuredTool.from_function(
            func=prepare_booking_draft_action,
            name="prepare_booking_draft_action",
            description=(
                "Help a customer start an order with a chosen provider. Collect only "
                "the provider and a specific task description. Polish the description, "
                "then return data that opens the normal booking form for the customer."
            ),
            args_schema=PrepareBookingDraftActionToolInput,
        ),
        StructuredTool.from_function(
            func=summarize_provider_reviews,
            name="summarize_provider_reviews",
            description=(
                "Compare selected providers using their reviews, including price, "
                "attitude, reputation, strengths, and risks."
            ),
            args_schema=SummarizeProviderReviewsToolInput,
        ),
    ]


def get_langchain_tool_summaries(current_user: models.User, db: Session):
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "args_schema": tool.args_schema.model_json_schema() if tool.args_schema else None,
        }
        for tool in build_langchain_tools(current_user, db)
    ]


def run_langchain_tool(
    tool_name: str,
    tool_args: dict[str, Any],
    current_user: models.User,
    db: Session,
):
    tools = {tool.name: tool for tool in build_langchain_tools(current_user, db)}
    tool = tools.get(tool_name)
    if not tool:
        return {"tool_name": tool_name, "error": "Tool not found"}
    return {"tool_name": tool_name, "result": tool.invoke(tool_args)}

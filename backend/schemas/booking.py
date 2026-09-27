from datetime import date, datetime, time
from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from backend.constants import ALLOWED_PROVIDER_TAGS

from backend.schemas.auth import UserResponse
from backend.schemas.chat import ChatMessageResponse, ChatRoomResponse
from backend.schemas.common import *  # noqa: F403
from backend.schemas.provider import ProviderProfileResponse
from backend.core.clock import to_workshop_datetime

class BookingAttachmentResponse(BaseModel):
    id: int
    booking_id: int
    uploaded_by_user_id: int
    original_file_name: str
    file_name: str
    file_url: str
    content_type: str
    size: int
    created_at: str

class BookingCreate(BaseModel):
    provider_profile_id: int
    chat_room_id: int | None = None
    title: str
    service_description: str
    service_address: str
    service_latitude: float = Field(ge=-90, le=90)
    service_longitude: float = Field(ge=-180, le=180)
    customer_current_address: str | None = None
    customer_current_latitude: float | None = Field(default=None, ge=-90, le=90)
    customer_current_longitude: float | None = Field(default=None, ge=-180, le=180)
    scheduled_start_time: datetime
    scheduled_end_time: datetime

    model_config = {
        "json_schema_extra": {
            "example": {
                "provider_profile_id": 1,
                "chat_room_id": 1,
                "service_description": "Kitchen pipe leak, needs on-site repair",
                "service_address": "Sultanahmet, Istanbul",
                "service_latitude": 41.0082,
                "service_longitude": 28.9784,
                "customer_current_address": "Taksim, Istanbul",
                "customer_current_latitude": 41.0369,
                "customer_current_longitude": 28.985,
                "scheduled_start_time": "2026-09-03T10:00:00",
                "scheduled_end_time": "2026-09-03T12:00:00",
            }
        }
    }

    @field_validator("service_description", "service_address")
    @classmethod
    def validate_text_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Field cannot be empty")

        return value

    @field_validator("title")
    @classmethod
    def validate_title(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be empty")
        if len(value.split()) > 30:
            raise ValueError("Title must contain at most 30 words")
        return value

    @model_validator(mode="after")
    def validate_time_range(self):
        start = to_workshop_datetime(self.scheduled_start_time)
        end = to_workshop_datetime(self.scheduled_end_time)
        if end <= start:
            raise ValueError("Scheduled end time must be after scheduled start time")

        return self

class BookingUpdate(BaseModel):
    title: str
    service_description: str
    service_address: str
    service_latitude: float = Field(ge=-90, le=90)
    service_longitude: float = Field(ge=-180, le=180)
    customer_current_address: str | None = None
    customer_current_latitude: float | None = Field(default=None, ge=-90, le=90)
    customer_current_longitude: float | None = Field(default=None, ge=-180, le=180)
    scheduled_start_time: datetime
    scheduled_end_time: datetime

    model_config = {
        "json_schema_extra": {
            "example": {
                "service_description": "Kitchen pipe leak, needs on-site repair",
                "service_address": "Sultanahmet, Istanbul",
                "service_latitude": 41.0082,
                "service_longitude": 28.9784,
                "customer_current_address": "Taksim, Istanbul",
                "customer_current_latitude": 41.0369,
                "customer_current_longitude": 28.985,
                "scheduled_start_time": "2026-09-03T10:00:00",
                "scheduled_end_time": "2026-09-03T12:00:00",
            }
        }
    }

    @field_validator("service_description", "service_address")
    @classmethod
    def validate_text_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Field cannot be empty")

        return value

    @field_validator("title")
    @classmethod
    def validate_title(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be empty")
        if len(value.split()) > 30:
            raise ValueError("Title must contain at most 30 words")
        return value

    @model_validator(mode="after")
    def validate_time_range(self):
        start = to_workshop_datetime(self.scheduled_start_time)
        end = to_workshop_datetime(self.scheduled_end_time)
        if end <= start:
            raise ValueError("Scheduled end time must be after scheduled start time")

        return self

class BookingStatus(str, Enum):
    pending = "pending"
    quoted = "quoted"
    awaiting_payment = "awaiting_payment"
    accepted = "accepted"
    rejected = "rejected"
    refunding = "refunding"
    refunded = "refunded"
    awaiting_confirmation = "awaiting_confirmation"
    completed = "completed"
    cancelled = "cancelled"

class BookingBaseResponse(BaseModel):
    id: int
    customer_id: int
    provider_profile_id: int
    chat_room_id: int | None = None
    title: str
    service_description: str
    service_address: str
    service_latitude: float
    service_longitude: float
    customer_current_address: str | None = None
    customer_current_latitude: float | None = None
    customer_current_longitude: float | None = None
    booking_at: str
    scheduled_start_time: str
    scheduled_end_time: str
    completed_at: str | None = None
    total_amount: float
    quote_amount: float | None = None
    quote_message: str | None = None
    quoted_at: str | None = None
    status: BookingStatus
    status_note: str | None = None

class BookingComplaintSummaryResponse(BaseModel):
    has_open_complaint: bool
    open_complaint_count: int
    total_complaint_count: int

class BookingDetailResponse(BookingBaseResponse):
    customer: UserResponse | None = None
    provider: ProviderProfileResponse | None = None
    attachments: list[BookingAttachmentResponse] = Field(default_factory=list)
    complaint_summary: BookingComplaintSummaryResponse
    current_refund_request: dict[str, Any] | None = None

class ProviderBookingQuoteCreate(BaseModel):
    quote_amount: float = Field(gt=0)
    quote_message: str | None = None

class BookingNoteUpdate(BaseModel):
    status_note: str

    @field_validator("status_note")
    @classmethod
    def validate_status_note_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Status note cannot be empty")

        return value

class AdminBookingStatusUpdate(BaseModel):
    status: BookingStatus
    status_note: str

    @field_validator("status_note")
    @classmethod
    def validate_status_note_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Status note cannot be empty")

        return value

class PaymentStatus(str, Enum):
    pending = "pending"
    checkout_created = "checkout_created"
    processing = "processing"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"

class PaymentCreate(BaseModel):
    payment_method: str = "iyzico_checkout"

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Payment method cannot be empty")

        return value

class RefundRequestStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    appealed = "appealed"
    admin_rejected = "admin_rejected"
    cancelled = "cancelled"

class RefundServiceStage(str, Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    service_completed = "service_completed"

class RefundRequestCreate(BaseModel):
    service_stage: RefundServiceStage
    reason: str

    @field_validator("reason")
    @classmethod
    def validate_reason_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Reason cannot be empty")

        return value

class RefundAppealCreate(BaseModel):
    appeal_reason: str

    @field_validator("appeal_reason")
    @classmethod
    def validate_appeal_reason_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Appeal reason cannot be empty")

        return value

class ProviderRefundRejectCreate(BaseModel):
    provider_note: str

    @field_validator("provider_note")
    @classmethod
    def validate_provider_note_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Provider note cannot be empty")

        return value

class AdminRefundDecisionCreate(BaseModel):
    admin_note: str

    @field_validator("admin_note")
    @classmethod
    def validate_admin_note_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Admin note cannot be empty")

        return value

class BookingCreateResponseData(BaseModel):
    booking: BookingDetailResponse
    chat_room: ChatRoomResponse
    chat_message: ChatMessageResponse

class BookingUpdateResponseData(BaseModel):
    message: str
    booking: BookingDetailResponse
    chat_message: ChatMessageResponse | None = None


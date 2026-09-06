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

from backend.schemas.common import *  # noqa: F403

class UserRole(str, Enum):
    customer = "customer"
    provider = "provider"
    admin = "admin"

class SocialAuthProvider(str, Enum):
    google = "google"
    apple = "apple"

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: UserRole

    @field_validator("name")
    @classmethod
    def validate_name_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Name cannot be empty")

        return value

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    avatar_url: str | None = None
    is_active: bool = True
    is_banned: bool = False
    last_login_at: str | None = None
    created_at: str | None = None

class UserProfileUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Name cannot be empty")

        return value.strip()

class AvatarUploadResponse(BaseModel):
    original_file_name: str
    file_name: str
    file_url: str
    content_type: str
    size: int
    user: UserResponse

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse

class SocialLoginRequest(BaseModel):
    provider: SocialAuthProvider
    id_token: str
    role: UserRole = UserRole.customer
    name: str | None = None
    email: EmailStr | None = None

    @field_validator("id_token")
    @classmethod
    def validate_id_token_not_empty(cls, value):
        if not value.strip():
            raise ValueError("ID token cannot be empty")

        return value

    @field_validator("name")
    @classmethod
    def validate_name_not_empty_when_provided(cls, value):
        if value is not None and not value.strip():
            raise ValueError("Name cannot be empty")

        return value

class SocialLoginResponseData(TokenResponse):
    provider: SocialAuthProvider
    is_new_user: bool
    linked_social_account: bool

class OAuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RegisterResponseData(BaseModel):
    user: UserResponse

class RefreshTokenRequest(BaseModel):
    refresh_token: str

    @field_validator("refresh_token")
    @classmethod
    def validate_refresh_token_not_empty(cls, value):
        if not value.strip():
            raise ValueError("Refresh token cannot be empty")

        return value

class AdminUserStatusUpdate(BaseModel):
    is_active: bool | None = None
    is_banned: bool | None = None

    @model_validator(mode="after")
    def validate_at_least_one_field(self):
        if self.is_active is None and self.is_banned is None:
            raise ValueError("At least one status field is required")

        return self


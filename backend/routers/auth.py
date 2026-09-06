"""Auth API: register, login, social login, refresh, logout, and current user."""

import secrets

from fastapi import Depends, File, HTTPException, UploadFile
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend import models
from backend.auth import (
    create_password_identity,
    create_token_pair,
    ensure_user_can_login,
    get_current_user,
    get_db,
    get_now,
    get_password_identity,
    revoke_refresh_token,
    validate_password_policy,
    validate_refresh_token,
    verify_password,
)
from backend.schemas import (
    ApiResponse,
    AvatarUploadResponse,
    OAuthTokenResponse,
    RefreshTokenRequest,
    RegisterResponseData,
    SocialLoginRequest,
    SocialLoginResponseData,
    TokenResponse,
    UserProfileUpdate,
    UserRegister,
    UserResponse,
)
from backend.services.social_auth_service import verify_social_identity
from backend.utils.formatters import format_user_response
from backend.utils.response import success_response
from backend.utils.router import ApiRouter
from backend.utils.upload import delete_local_upload, save_avatar_upload

router = ApiRouter(tags=["Auth"])


def authenticate_user(email: str, password: str, db: Session):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    identity = get_password_identity(user, db)
    if not identity or not identity.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(password, identity.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    ensure_user_can_login(user)
    return user


def login_user(user: models.User, db: Session):
    user.last_login_at = get_now()
    access_token, refresh_token = create_token_pair(user, db)
    db.commit()
    db.refresh(user)
    return access_token, refresh_token


def resolve_social_login_user(
    request_data: SocialLoginRequest,
    db: Session,
):
    if request_data.role == "admin":
        raise HTTPException(
            status_code=400,
            detail="Admin accounts cannot be created from social login",
        )

    verified_identity = verify_social_identity(
        request_data.provider.value,
        request_data.id_token,
    )

    social_account = (
        db.query(models.SocialAccount)
        .filter(
            models.SocialAccount.provider == verified_identity.provider,
            models.SocialAccount.provider_user_id == verified_identity.provider_user_id,
        )
        .first()
    )
    now = get_now()

    if social_account:
        user = (
            db.query(models.User)
            .filter(models.User.id == social_account.user_id)
            .first()
        )
        if not user:
            raise HTTPException(status_code=401, detail="Linked user does not exist")

        ensure_user_can_login(user)
        social_account.provider_email = verified_identity.email
        social_account.provider_name = verified_identity.name or request_data.name
        social_account.last_login_at = now
        return user, False, False

    email = verified_identity.email or request_data.email
    if not email:
        raise HTTPException(
            status_code=400,
            detail="Social login did not provide an email address",
        )

    user = db.query(models.User).filter(models.User.email == email).first()
    is_new_user = False

    if user:
        ensure_user_can_login(user)
    else:
        fallback_name = email.split("@", maxsplit=1)[0]
        new_user_name = verified_identity.name or request_data.name or fallback_name
        user = models.User(
            name=new_user_name,
            email=email,
            role=request_data.role.value,
            is_active=True,
            is_banned=False,
            last_login_at=None,
            created_at=now,
        )
        db.add(user)
        db.flush()
        is_new_user = True

    social_account = models.SocialAccount(
        user_id=user.id,
        provider=verified_identity.provider,
        provider_user_id=verified_identity.provider_user_id,
        provider_email=email,
        provider_name=verified_identity.name or request_data.name,
        created_at=now,
        last_login_at=now,
    )
    db.add(social_account)
    db.flush()

    return user, is_new_user, True


@router.post("/register", response_model=ApiResponse[RegisterResponseData])
def register(user: UserRegister, db: Session = Depends(get_db)):
    if user.role == "admin":
        raise HTTPException(
            status_code=400,
            detail="Admin accounts cannot be created from public registration",
        )
    validate_password_policy(user.password)
    existing_user = (
        db.query(models.User).filter(models.User.email == user.email).first()
    )
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = models.User(
        name=user.name,
        email=user.email,
        role=user.role,
        is_active=True,
        is_banned=False,
        last_login_at=None,
        created_at=get_now(),
    )
    db.add(new_user)
    db.flush()
    create_password_identity(new_user, user.password, db)
    db.commit()
    db.refresh(new_user)
    return success_response(
        {
            "message": "User registered successfully",
            "user": format_user_response(new_user),
        }
    )


@router.post("/social-login", response_model=ApiResponse[SocialLoginResponseData])
def social_login(
    request_data: SocialLoginRequest,
    db: Session = Depends(get_db),
):
    user, is_new_user, linked_social_account = resolve_social_login_user(
        request_data,
        db,
    )
    access_token, refresh_token = login_user(user, db)

    return success_response(
        {
            "message": "Social login successful",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": format_user_response(user),
            "provider": request_data.provider,
            "is_new_user": is_new_user,
            "linked_social_account": linked_social_account,
        }
    )


@router.post("/login", response_model=ApiResponse[TokenResponse])
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = authenticate_user(form_data.username, form_data.password, db)
    access_token, refresh_token = login_user(user, db)
    return success_response(
        {
            "message": "Login successful",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": format_user_response(user),
        }
    )


@router.post("/token", response_model=OAuthTokenResponse)
def swagger_login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = authenticate_user(form_data.username, form_data.password, db)
    access_token, refresh_token = login_user(user, db)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/refresh-token", response_model=ApiResponse[TokenResponse])
def refresh_token(request_data: RefreshTokenRequest, db: Session = Depends(get_db)):
    user, token_record = validate_refresh_token(request_data.refresh_token, db)
    token_record.revoked_at = get_now()
    access_token, new_refresh_token = create_token_pair(user, db)
    db.commit()
    return success_response(
        {
            "message": "Token refreshed successfully",
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "user": format_user_response(user),
        }
    )


@router.post("/logout", response_model=ApiResponse[None])
def logout(request_data: RefreshTokenRequest, db: Session = Depends(get_db)):
    revoke_refresh_token(request_data.refresh_token, db)
    return success_response({"message": "Logout successful"})


@router.get("/me", response_model=ApiResponse[UserResponse])
def get_me(current_user: models.User = Depends(get_current_user)):
    return success_response(format_user_response(current_user))


@router.put("/me", response_model=ApiResponse[UserResponse])
def update_me(
    profile_data: UserProfileUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.name = profile_data.name
    db.commit()
    db.refresh(current_user)
    return success_response(
        format_user_response(current_user),
        message="User profile updated successfully",
    )


@router.post("/me/avatar", response_model=ApiResponse[AvatarUploadResponse])
async def upload_me_avatar(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    upload_result = await save_avatar_upload(file)
    old_avatar_url = current_user.avatar_url
    current_user.avatar_url = upload_result["file_url"]
    db.commit()
    db.refresh(current_user)

    if old_avatar_url and old_avatar_url != current_user.avatar_url:
        delete_local_upload(old_avatar_url)

    return success_response(
        {
            **upload_result,
            "user": format_user_response(current_user),
        },
        message="Avatar uploaded successfully",
    )

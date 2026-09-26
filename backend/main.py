"""FastAPI application entry point.

Creates the app, configures CORS, mounts uploads, registers routers, and unified exception handling.
Business logic belongs in routers/utils/services/tasks — not in main.py.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import CORS_ORIGINS, UPLOAD_DIR
from backend.routers import (
    admin,
    admin_verification,
    ai,
    auth,
    customer,
    provider,
    provider_verification,
    public,
    shared,
    websocket,
)
from backend.utils.errors import (
    general_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)
from backend.utils.response import success_response

Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

OPENAPI_TAGS = [
    {
        "name": "Auth",
        "description": "Registration, login, token refresh, logout, mock verify, and account security.",
    },
    {
        "name": "Public",
        "description": "Public endpoints (no login): provider listings, details, and reviews.",
    },
    {
        "name": "Customer",
        "description": "Customer-only endpoints: profile, favorites, bookings, payments, refunds, complaints, reviews.",
    },
    {
        "name": "Provider",
        "description": "Provider-only endpoints: profile, quotes, completion, refunds, and earnings.",
    },
    {
        "name": "Admin",
        "description": "Admin-only endpoints: users, provider verification, complaints, reviews, and platform stats.",
    },
    {
        "name": "Shared",
        "description": "Multi-role endpoints: chat messages, notifications, booking details, and status history.",
    },
    {
        "name": "AI",
        "description": "AI chat, recommendations, async tasks, and vector search.",
    },
    {
        "name": "WebSocket",
        "description": "Real-time chat connections for chat room message delivery.",
    },
]

app = FastAPI(
    title="Workshop AI Backend API",
    description=(
        "Workshop AI backend API. See `docs/backend-api-standard.md` for conventions."
    ),
    version="0.1.0",
    openapi_tags=OPENAPI_TAGS,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(public.router)
app.include_router(customer.router)
app.include_router(provider.router)
app.include_router(provider_verification.router)
app.include_router(admin.router)
app.include_router(admin_verification.router)
app.include_router(shared.router)
app.include_router(ai.router)
app.include_router(websocket.router)


@app.get("/")
def home():
    return success_response(message="Workshop AI backend is running")


@app.get("/health")
def health_check():
    return success_response(
        {
            "status": "ok",
            "service": "Workshop AI backend",
        }
    )

import os
from pathlib import Path

from dotenv import load_dotenv

from backend.llm_provider import resolve_llm_settings

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CERTS_DIR = PROJECT_ROOT / "backend" / "certs"


def get_config(name: str, default: str):
    value = os.getenv(name)

    if value is None or not value.strip():
        return default

    return value.strip()


def get_int_config(name: str, default: int):
    return int(get_config(name, str(default)))


def get_float_config(name: str, default: float):
    return float(get_config(name, str(default)))


def get_list_config(name: str, default: list[str]):
    value = get_config(name, ",".join(default))

    return [item.strip() for item in value.split(",") if item.strip()]


def load_optional_file(path: str) -> str:
    pem_path = Path(path)
    if not pem_path.is_file():
        return ""
    return pem_path.read_text(encoding="utf-8")


SECRET_KEY = get_config("WORKSHOP_SECRET_KEY", "workshop-ai-secret-key")
ALGORITHM = get_config("WORKSHOP_JWT_ALGORITHM", "RS256")
JWT_PRIVATE_KEY_PATH = get_config(
    "WORKSHOP_JWT_PRIVATE_KEY_PATH",
    str(CERTS_DIR / "jwt-private.pem"),
)
JWT_PUBLIC_KEY_PATH = get_config(
    "WORKSHOP_JWT_PUBLIC_KEY_PATH",
    str(CERTS_DIR / "jwt-public.pem"),
)
JWT_PRIVATE_KEY = get_config("WORKSHOP_JWT_PRIVATE_KEY", "") or load_optional_file(
    JWT_PRIVATE_KEY_PATH
)
JWT_PUBLIC_KEY = get_config("WORKSHOP_JWT_PUBLIC_KEY", "") or load_optional_file(
    JWT_PUBLIC_KEY_PATH
)
ACCESS_TOKEN_EXPIRE_MINUTES = get_int_config(
    "WORKSHOP_ACCESS_TOKEN_EXPIRE_MINUTES",
    30,
)
REFRESH_TOKEN_EXPIRE_DAYS = get_int_config(
    "WORKSHOP_REFRESH_TOKEN_EXPIRE_DAYS",
    7,
)

GOOGLE_CLIENT_IDS = get_list_config("WORKSHOP_GOOGLE_CLIENT_IDS", [])
APPLE_CLIENT_IDS = get_list_config("WORKSHOP_APPLE_CLIENT_IDS", [])
GOOGLE_MAPS_API_KEY = get_config("WORKSHOP_GOOGLE_MAPS_API_KEY", "")
APPLE_TOKEN_ISSUER = get_config(
    "WORKSHOP_APPLE_TOKEN_ISSUER",
    "https://appleid.apple.com",
)


DATABASE_URL = get_config(
    "WORKSHOP_DATABASE_URL",
    "postgresql+psycopg://workshop:workshop@127.0.0.1:5436/workshop",
)

IYZICO_BASE_URL = get_config(
    "IYZICO_BASE_URL",
    "https://sandbox-api.iyzipay.com",
)
IYZICO_API_KEY = get_config("IYZICO_API_KEY", "")
IYZICO_SECRET_KEY = get_config("IYZICO_SECRET_KEY", "")
IYZICO_CALLBACK_URL = get_config(
    "IYZICO_CALLBACK_URL",
    "http://localhost:8000/payments/iyzico/callback",
)
IYZICO_FRONTEND_RETURN_URL = get_config("IYZICO_FRONTEND_RETURN_URL", "")
IYZICO_TIMEOUT_SECONDS = get_float_config("IYZICO_TIMEOUT_SECONDS", 15.0)
IYZICO_CHECKOUT_TTL_SECONDS = get_int_config("IYZICO_CHECKOUT_TTL_SECONDS", 1800)


DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:8082",
    "http://127.0.0.1:8082",
    "http://localhost:8090",
    "http://127.0.0.1:8090",
    "http://10.10.10.10:8090",
    "http://localhost:19000",
    "http://127.0.0.1:19000",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
]
CORS_ORIGINS = get_list_config("WORKSHOP_CORS_ORIGINS", DEFAULT_CORS_ORIGINS)


REDIS_HOST = get_config("WORKSHOP_REDIS_HOST", "127.0.0.1")
REDIS_PORT = get_int_config("WORKSHOP_REDIS_PORT", 6379)
REDIS_DB = get_int_config("WORKSHOP_REDIS_DB", 0)


MILVUS_HOST = get_config("WORKSHOP_MILVUS_HOST", "127.0.0.1")
MILVUS_PORT = get_int_config("WORKSHOP_MILVUS_PORT", 19530)
MILVUS_REVIEW_COLLECTION = get_config(
    "WORKSHOP_MILVUS_REVIEW_COLLECTION",
    "provider_reviews",
)


_llm = resolve_llm_settings()
LLM_PROVIDER = _llm.provider
LLM_BASE_URL = _llm.base_url
LLM_API_KEY = _llm.api_key
LLM_MODEL = _llm.model
LLM_TEMPERATURE = get_float_config("LLM_TEMPERATURE", 0.2)
LLM_MAX_TOKENS = get_int_config("LLM_MAX_TOKENS", 1200)
LLM_TIMEOUT_SECONDS = get_float_config("LLM_TIMEOUT_SECONDS", 300)
LLM_MAX_RETRIES = get_int_config("LLM_MAX_RETRIES", 1)

EMBEDDING_API_KEY = _llm.embedding_api_key
EMBEDDING_BASE_URL = _llm.embedding_base_url
EMBEDDING_MODEL = _llm.embedding_model
EMBEDDING_DIMENSION = _llm.embedding_dimension
LLM_SUPPORTS_EMBEDDINGS = _llm.supports_embeddings


CELERY_BROKER_URL = get_config(
    "WORKSHOP_CELERY_BROKER_URL",
    "redis://127.0.0.1:6379/1",
)
CELERY_RESULT_BACKEND = get_config(
    "WORKSHOP_CELERY_RESULT_BACKEND",
    "redis://127.0.0.1:6379/2",
)


UPLOAD_DIR = get_config(
    "WORKSHOP_UPLOAD_DIR",
    str(PROJECT_ROOT / "backend" / "uploads"),
)
VERIFICATION_UPLOAD_DIR = get_config(
    "WORKSHOP_VERIFICATION_UPLOAD_DIR",
    str(PROJECT_ROOT / "backend" / "private_uploads" / "verification"),
)
MAX_UPLOAD_SIZE_MB = get_int_config("WORKSHOP_MAX_UPLOAD_SIZE_MB", 50)
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

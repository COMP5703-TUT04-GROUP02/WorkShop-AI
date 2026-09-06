from __future__ import annotations

from backend.ai.oauth.chatgpt import ChatGPTOAuth
from backend.ai.oauth.files import read_secret_file, write_secret_file
from backend.config import CERTS_DIR, LLM_PROVIDER

chatgpt_oauth = ChatGPTOAuth(CERTS_DIR / "chatgpt_oauth.json")
_ACTIVE_PATH = CERTS_DIR / "llm_auth.json"

VALID_AUTH = {"key", "chatgpt"}


def get_saved_auth() -> str:
    data = read_secret_file(_ACTIVE_PATH) or {}
    auth = str(data.get("auth") or "key").strip().lower()
    return auth if auth in VALID_AUTH else "key"


def set_saved_auth(auth: str) -> str:
    cleaned = (auth or "key").strip().lower()
    if cleaned not in VALID_AUTH:
        raise ValueError("auth must be key or chatgpt")
    if cleaned == "chatgpt" and not chatgpt_oauth.connected():
        raise ValueError("Sign in to ChatGPT first")
    write_secret_file(_ACTIVE_PATH, {"auth": cleaned})
    return cleaned


def get_llm_auth_mode() -> str:
    saved = get_saved_auth()
    if saved == "chatgpt" and chatgpt_oauth.connected():
        return "chatgpt"
    return "key"


def subscription_status() -> dict:
    return {
        "auth": get_llm_auth_mode(),
        "saved_auth": get_saved_auth(),
        "llm_provider": LLM_PROVIDER,
        "chatgpt": chatgpt_oauth.status(),
    }


def logout_chatgpt() -> dict:
    chatgpt_oauth.logout()
    if get_saved_auth() == "chatgpt":
        set_saved_auth("key")
    return subscription_status()

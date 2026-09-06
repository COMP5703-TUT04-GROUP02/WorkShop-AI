"""Resolve chat and embedding settings for OpenAI-compatible LLM vendors.

ChatGPT Plus can authenticate with a device-code login. Qwen and OpenAI API
keys also provide embeddings for review search.
"""

from __future__ import annotations

from dataclasses import dataclass
import os

QWEN_DEFAULT_BASE_URL = (
    "https://ws-fuphxs3ga06u0gd5.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
)

PROVIDER_ALIASES = {
    "gpt": "openai",
    "chatgpt": "openai",
    "dashscope": "qwen",
    "aliyun": "qwen",
    "qwen": "qwen",
    "openai": "openai",
    "custom": "custom",
}

PRESETS: dict[str, dict[str, object]] = {
    "qwen": {
        "base_url": QWEN_DEFAULT_BASE_URL,
        "model": "qwen3.8-max",
        "key_env": ("QWEN_API_KEY", "DASHSCOPE_API_KEY", "LLM_API_KEY"),
        "embedding_model": "text-embedding-v4",
        "embedding_dimension": 1024,
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-6-astra",
        "key_env": ("OPENAI_API_KEY", "LLM_API_KEY"),
        "embedding_model": "text-embedding-3-large",
        "embedding_dimension": 1024,
    },
    "custom": {
        "base_url": "",
        "model": "",
        "key_env": ("LLM_API_KEY",),
        "embedding_model": "",
        "embedding_dimension": 1024,
    },
}


@dataclass(frozen=True)
class LlmSettings:
    provider: str
    api_key: str
    base_url: str
    model: str
    embedding_api_key: str
    embedding_base_url: str
    embedding_model: str
    embedding_dimension: int
    supports_embeddings: bool


def _env(name: str, getenv) -> str:
    value = getenv(name)
    if value is None or not str(value).strip():
        return ""
    return str(value).strip()


def normalize_llm_provider(value: str) -> str:
    provider = (value or "qwen").strip().lower()
    return PROVIDER_ALIASES.get(provider, provider)


def first_env(names: tuple[str, ...], getenv) -> str:
    for name in names:
        value = _env(name, getenv)
        if value:
            return value
    return ""


def resolve_llm_settings(getenv=os.getenv) -> LlmSettings:
    provider = normalize_llm_provider(_env("LLM_PROVIDER", getenv) or "qwen")
    preset = PRESETS.get(provider)
    if preset is None:
        known = ", ".join(sorted(PRESETS))
        raise ValueError(
            f"Unknown LLM_PROVIDER={provider!r}. Use one of: {known}."
        )

    key_env = preset["key_env"]
    assert isinstance(key_env, tuple)

    api_key = first_env(key_env, getenv)
    base_url = _env("LLM_BASE_URL", getenv) or str(preset["base_url"])
    model = _env("LLM_MODEL", getenv) or str(preset["model"])

    embedding_api_key = (
        _env("EMBEDDING_API_KEY", getenv)
        or first_env(("OPENAI_API_KEY", "QWEN_API_KEY", "DASHSCOPE_API_KEY"), getenv)
        or api_key
    )
    embedding_base_url = _env("EMBEDDING_BASE_URL", getenv) or base_url
    embedding_model = _env("EMBEDDING_MODEL", getenv) or str(preset["embedding_model"])
    embedding_dimension_raw = _env("EMBEDDING_DIMENSION", getenv)
    embedding_dimension = (
        int(embedding_dimension_raw)
        if embedding_dimension_raw
        else int(preset["embedding_dimension"])
    )

    return LlmSettings(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        model=model,
        embedding_api_key=embedding_api_key,
        embedding_base_url=embedding_base_url,
        embedding_model=embedding_model,
        embedding_dimension=embedding_dimension,
        supports_embeddings=bool(embedding_model and embedding_api_key),
    )

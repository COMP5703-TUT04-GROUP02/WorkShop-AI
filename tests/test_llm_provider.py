import pytest

from backend.llm_provider import resolve_llm_settings


def _getenv(values):
    def getenv(name, default=None):
        return values.get(name, default)

    return getenv


def test_qwen_defaults_when_provider_omitted():
    settings = resolve_llm_settings(_getenv({}))

    assert settings.provider == "qwen"
    assert settings.model == "qwen3.8-max"
    assert "compatible-mode/v1" in settings.base_url
    assert settings.embedding_model == "text-embedding-v4"
    assert settings.supports_embeddings is False


def test_openai_uses_vendor_key_and_gpt_model():
    settings = resolve_llm_settings(
        _getenv(
            {
                "LLM_PROVIDER": "gpt",
                "OPENAI_API_KEY": "sk-test",
            }
        )
    )

    assert settings.provider == "openai"
    assert settings.api_key == "sk-test"
    assert settings.base_url == "https://api.openai.com/v1"
    assert settings.model == "gpt-6-astra"
    assert settings.embedding_model == "text-embedding-3-large"
    assert settings.supports_embeddings is True


def test_qwen_uses_vendor_key():
    settings = resolve_llm_settings(
        _getenv(
            {
                "LLM_PROVIDER": "dashscope",
                "QWEN_API_KEY": "qwen-key",
            }
        )
    )

    assert settings.provider == "qwen"
    assert settings.api_key == "qwen-key"
    assert settings.embedding_api_key == "qwen-key"
    assert settings.supports_embeddings is True


def test_removed_vendors_are_rejected():
    for provider in ("kimi", "kimi-global", "kimi-code", "claude", "grok", "mistral"):
        with pytest.raises(ValueError, match="Unknown LLM_PROVIDER"):
            resolve_llm_settings(_getenv({"LLM_PROVIDER": provider}))

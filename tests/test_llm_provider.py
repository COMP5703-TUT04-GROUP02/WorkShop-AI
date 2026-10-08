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
    assert settings.model == "gpt-6.1-sol"
    assert settings.embedding_model == "text-embedding-3-large"
    assert settings.supports_embeddings is True


def test_embedding_env_overrides_keep_qwen_chat_preset():
    settings = resolve_llm_settings(
        _getenv(
            {
                "EMBEDDING_API_KEY": "tei",
                "EMBEDDING_BASE_URL": "http://tei:80/v1",
                "EMBEDDING_MODEL": "Qwen/Qwen3-Embedding-0.6B",
            }
        )
    )

    assert settings.provider == "qwen"
    assert settings.model == "qwen3.8-max"
    assert settings.embedding_api_key == "tei"
    assert settings.embedding_base_url == "http://tei:80/v1"
    assert settings.embedding_model == "Qwen/Qwen3-Embedding-0.6B"
    assert settings.embedding_dimension == 1024
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


def test_kimi_and_grok_default_models():
    kimi = resolve_llm_settings(_getenv({"LLM_PROVIDER": "kimi", "LLM_API_KEY": "k"}))
    kimi_code = resolve_llm_settings(
        _getenv({"LLM_PROVIDER": "kimi-code", "LLM_API_KEY": "k"})
    )
    grok = resolve_llm_settings(_getenv({"LLM_PROVIDER": "grok", "LLM_API_KEY": "k"}))
    assert kimi.model == "kimi-k3"
    assert kimi_code.model == "k3"
    assert grok.model == "grok-4.7"


def test_new_vendors_use_official_hosts():
    cases = {
        "claude": ("claude", "api.anthropic.com"),
        "kimi": ("kimi", "api.moonshot.cn"),
        "kimi-code": ("kimi-code", "api.kimi.com/coding"),
        "deepseek": ("deepseek", "api.deepseek.com"),
        "grok": ("grok", "api.x.ai"),
        "xai": ("grok", "api.x.ai"),
    }
    for raw, (provider, host) in cases.items():
        settings = resolve_llm_settings(
            _getenv({"LLM_PROVIDER": raw, "LLM_API_KEY": "k"})
        )
        assert settings.provider == provider
        assert host in settings.base_url


def test_unknown_vendor_is_rejected():
    with pytest.raises(ValueError, match="Unknown LLM_PROVIDER"):
        resolve_llm_settings(_getenv({"LLM_PROVIDER": "mistral"}))


@pytest.mark.parametrize(("provider", "uses_responses"), [("openai", True), ("qwen", False)])
def test_only_openai_chat_goes_through_the_responses_api(monkeypatch, provider, uses_responses):
    from types import SimpleNamespace

    from langchain_core.messages import AIMessage

    from backend.ai import clients

    monkeypatch.setattr(clients, "get_llm_auth_mode", lambda: "key")
    monkeypatch.setattr(
        clients,
        "resolve_chat_settings",
        lambda: SimpleNamespace(
            provider=provider, model="m", api_key="test-key", base_url="https://example.test/v1"
        ),
    )

    assert bool(clients.get_qwen_chat_model().use_responses_api) is uses_responses
    blocks = AIMessage(content=[{"type": "reasoning", "summary": []}, {"type": "text", "text": "hi"}])
    assert clients.get_message_content(blocks) == "hi"

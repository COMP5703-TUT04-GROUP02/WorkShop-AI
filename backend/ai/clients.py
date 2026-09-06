"""AI client factory.

Creates OpenAI-compatible chat and embedding models from env config,
or a ChatGPT Plus subscription when an admin has signed in.
"""

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from backend.ai.codex import DEFAULT_CODEX_MODEL, CodexChatModel
from backend.ai.oauth.runtime import get_llm_auth_mode
from backend.config import (
    EMBEDDING_API_KEY,
    EMBEDDING_BASE_URL,
    EMBEDDING_DIMENSION,
    EMBEDDING_MODEL,
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_MAX_TOKENS,
    LLM_MAX_RETRIES,
    LLM_MODEL,
    LLM_PROVIDER,
    LLM_TEMPERATURE,
    LLM_TIMEOUT_SECONDS,
)


def get_qwen_chat_model(
    temperature: float | None = None,
    max_tokens: int | None = None,
):
    auth_mode = get_llm_auth_mode()
    if auth_mode == "chatgpt":
        model_name = LLM_MODEL
        if (
            not model_name
            or model_name.startswith("qwen")
            or model_name in {"gpt-5.6", "gpt-6-astra"}
        ):
            model_name = DEFAULT_CODEX_MODEL
        return CodexChatModel(
            model=model_name,
            temperature=temperature if temperature is not None else LLM_TEMPERATURE,
            max_tokens=max_tokens if max_tokens is not None else LLM_MAX_TOKENS,
        )

    if not LLM_API_KEY:
        raise ValueError(
            "LLM API key is not configured. Set LLM_API_KEY or sign in with a "
            "ChatGPT Plus subscription in the admin dashboard."
        )

    kwargs = {
        "model": LLM_MODEL,
        "api_key": LLM_API_KEY,
        "base_url": LLM_BASE_URL,
        "max_tokens": LLM_MAX_TOKENS if max_tokens is None else max_tokens,
        "timeout": LLM_TIMEOUT_SECONDS,
        "max_retries": LLM_MAX_RETRIES,
    }
    if LLM_PROVIDER != "openai":
        kwargs["temperature"] = LLM_TEMPERATURE if temperature is None else temperature
    return ChatOpenAI(**kwargs)


def get_qwen_embedding_model():
    if not EMBEDDING_API_KEY or not EMBEDDING_MODEL or not EMBEDDING_BASE_URL:
        raise ValueError(
            "Embeddings are not configured for this LLM provider. "
            "Set EMBEDDING_API_KEY, EMBEDDING_BASE_URL, and EMBEDDING_MODEL, "
            "or use LLM_PROVIDER=openai|qwen."
        )

    return OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        api_key=EMBEDDING_API_KEY,
        base_url=EMBEDDING_BASE_URL,
        dimensions=EMBEDDING_DIMENSION,
        check_embedding_ctx_length=False,
        timeout=LLM_TIMEOUT_SECONDS,
        max_retries=LLM_MAX_RETRIES,
    )


def get_message_content(response):
    if isinstance(response.content, str):
        return response.content

    return str(response.content)


def invoke_qwen_chat(
    messages: list,
    temperature: float | None = None,
    max_tokens: int | None = None,
):
    model = get_qwen_chat_model(
        temperature=temperature,
        max_tokens=max_tokens,
    )
    response = model.invoke(messages)

    return get_message_content(response)


def invoke_qwen_embedding(text: str):
    embedding_model = get_qwen_embedding_model()

    return embedding_model.embed_query(text)

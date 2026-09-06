import base64
import json
import os
import stat

import pytest

from backend.ai.codex import (
    collapse_responses_stream,
    langchain_messages_to_codex_input,
    parse_codex_result,
)
from backend.ai.oauth import runtime
from backend.ai.oauth.chatgpt import account_id_from_jwt
from backend.ai.oauth.files import read_secret_file, write_secret_file
from backend.ai.oauth.http import OAuthProtocolError, raise_for_oauth_body


class _Msg:
    def __init__(self, msg_type, content, **extra):
        self.type = msg_type
        self.content = content
        for key, value in extra.items():
            setattr(self, key, value)


def _jwt(payload: dict) -> str:
    raw = json.dumps(payload).encode("utf-8")
    return "h." + base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=") + ".sig"


def test_account_id_from_jwt():
    assert account_id_from_jwt(_jwt({"chatgpt_account_id": "acct_123"})) == "acct_123"
    assert (
        account_id_from_jwt(
            _jwt({"https://api.openai.com/auth": {"chatgpt_account_id": "acct_nested"}})
        )
        == "acct_nested"
    )


def test_collapse_responses_stream_uses_completed_event():
    stream = "\n".join(
        [
            'data: {"type":"response.created","response":{"id":"1","output":[]}}',
            'data: {"type":"response.output_text.delta","delta":"Hello"}',
            'data: {"type":"response.completed","response":{"id":"1","output":[{"type":"message","content":[{"type":"output_text","text":"Hello"}]}]}}',
            "data: [DONE]",
        ]
    )
    result = collapse_responses_stream(stream)
    assert result["output"][0]["content"][0]["text"] == "Hello"


def test_collapse_responses_stream_rebuilds_empty_output():
    stream = "\n".join(
        [
            'data: {"type":"response.created","response":{"id":"1","output":[]}}',
            'data: {"type":"response.output_text.delta","delta":"Hi"}',
            'data: {"type":"response.completed","response":{"id":"1","output":[]}}',
        ]
    )
    result = collapse_responses_stream(stream)
    assert result["output"][0]["content"][0]["text"] == "Hi"


def test_langchain_messages_to_codex_input():
    items, instructions = langchain_messages_to_codex_input(
        [
            _Msg("system", "You are helpful."),
            _Msg("human", "Find a plumber"),
        ]
    )
    assert instructions == "You are helpful."
    assert items == [{"role": "user", "content": "Find a plumber"}]


def test_parse_codex_result_function_call():
    result = parse_codex_result(
        {
            "output": [
                {
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "search_providers",
                    "arguments": '{"query":"plumber"}',
                }
            ]
        }
    )
    assert result.content == ""
    assert result.tool_calls == [
        {
            "id": "call_1",
            "name": "search_providers",
            "args": {"query": "plumber"},
        }
    ]


def test_raise_for_oauth_pending():
    with pytest.raises(OAuthProtocolError) as caught:
        raise_for_oauth_body(
            400,
            b'{"error":"authorization_pending","error_description":"wait"}',
        )
    assert caught.value.code == "authorization_pending"
    assert caught.value.status == 400


def test_write_secret_file_is_owner_only(tmp_path):
    path = tmp_path / "token.json"
    write_secret_file(path, {"access": "secret"})
    assert read_secret_file(path) == {"access": "secret"}
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600


def test_auth_mode_requires_connected_subscription(monkeypatch):
    monkeypatch.setattr(runtime, "get_saved_auth", lambda: "chatgpt")
    monkeypatch.setattr(runtime.chatgpt_oauth, "connected", lambda: False)
    assert runtime.get_llm_auth_mode() == "key"

    monkeypatch.setattr(runtime.chatgpt_oauth, "connected", lambda: True)
    assert runtime.get_llm_auth_mode() == "chatgpt"


def test_set_saved_auth_rejects_disconnected(monkeypatch):
    monkeypatch.setattr(runtime.chatgpt_oauth, "connected", lambda: False)
    with pytest.raises(ValueError, match="Sign in to ChatGPT first"):
        runtime.set_saved_auth("chatgpt")


def test_set_saved_auth_rejects_removed_vendors():
    with pytest.raises(ValueError, match="auth must be key or chatgpt"):
        runtime.set_saved_auth("xai")

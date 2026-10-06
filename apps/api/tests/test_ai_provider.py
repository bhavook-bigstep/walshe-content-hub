"""AC16 — provider abstraction: config-selected, env keys, stub fallback, no network."""

from __future__ import annotations

import json
from contextlib import contextmanager

import httpx
import pytest

from app.ai.base import ChatMessage
from app.ai.claude import ClaudeProvider
from app.ai.factory import get_provider
from app.ai.gemini import GeminiProvider
from app.ai.openai import OpenAIProvider
from app.ai.stub import StubProvider
from app.config import Settings


def test_factory_selects_and_falls_back(monkeypatch):
    # Guard: any real HTTP call in this test is a bug.
    def _boom(*args, **kwargs):  # pragma: no cover - only hit on regression
        raise AssertionError("no network allowed in unit tests")

    monkeypatch.setattr(httpx, "post", _boom)

    # Selected provider but no key -> deterministic stub fallback.
    no_key = Settings(ai_provider="openai", openai_api_key=None)
    assert isinstance(get_provider(no_key), StubProvider)

    # Selected provider WITH a (fake) key -> the real provider class, no network at construction.
    fake_key = Settings(ai_provider="openai", openai_api_key="test-key-fake")
    provider = get_provider(fake_key)
    assert isinstance(provider, OpenAIProvider)

    # Unknown provider -> stub.
    assert isinstance(get_provider(Settings(ai_provider="nope")), StubProvider)


def test_stub_is_deterministic():
    stub = StubProvider()
    a = stub.complete("build a poster for Galway")
    b = stub.complete("build a poster for Galway")
    assert a == b
    assert a.provider == "stub"


@pytest.mark.parametrize("provider_name", ["claude", "openai", "gemini"])
def test_each_provider_constructs_with_key(provider_name):
    key_field = {
        "claude": "anthropic_api_key",
        "openai": "openai_api_key",
        "gemini": "gemini_api_key",
    }[provider_name]
    settings = Settings(ai_provider=provider_name, **{key_field: "test-key-fake"})
    provider = get_provider(settings)
    assert provider.name == provider_name


# --- real provider complete() paths: HTTP mocked, response parsing exercised (AC16) ---

# One case per provider: the constructed provider, the synthetic success payload its API returns,
# and the text complete() must parse out of it.
_PROVIDER_CASES = [
    (
        ClaudeProvider(api_key="test-key-fake"),
        {"content": [{"type": "text", "text": "Hello "}, {"type": "text", "text": "Galway"}]},
        "Hello Galway",
    ),
    (
        OpenAIProvider(api_key="test-key-fake"),
        {"choices": [{"message": {"content": "A bright poster"}}]},
        "A bright poster",
    ),
    (
        GeminiProvider(api_key="test-key-fake"),
        {"candidates": [{"content": {"parts": [{"text": "Wild "}, {"text": "Atlantic"}]}}]},
        "Wild Atlantic",
    ),
]


def _mock_post(monkeypatch, *, json_body: dict, status_code: int = 200):
    """Patch ``httpx.post`` to return a synthetic Response — no network is ever touched."""

    def _fake_post(url, **kwargs):
        return httpx.Response(
            status_code,
            json=json_body,
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", _fake_post)


@pytest.mark.parametrize("provider, payload, expected", _PROVIDER_CASES)
def test_provider_complete_parses_response(monkeypatch, provider, payload, expected):
    _mock_post(monkeypatch, json_body=payload)
    result = provider.complete("build a poster", max_tokens=16)
    assert result.text == expected
    assert result.provider == provider.name
    assert result.model == provider.model


@pytest.mark.parametrize("provider, _payload, _expected", _PROVIDER_CASES)
def test_provider_complete_raises_on_http_error(monkeypatch, provider, _payload, _expected):
    _mock_post(monkeypatch, json_body={"error": "boom"}, status_code=500)
    with pytest.raises(httpx.HTTPStatusError):
        provider.complete("build a poster")


@pytest.mark.parametrize(
    "provider",
    [OpenAIProvider(api_key="test-key-fake"), GeminiProvider(api_key="test-key-fake")],
    ids=["openai", "gemini"],
)
def test_strict_provider_complete_raises_on_malformed_payload(monkeypatch, provider):
    # 200 OK but the expected keys are absent -> the parser must surface a KeyError, not guess.
    _mock_post(monkeypatch, json_body={"unexpected": "shape"})
    with pytest.raises((KeyError, IndexError)):
        provider.complete("build a poster")


def test_claude_complete_tolerates_missing_content(monkeypatch):
    # Claude's parser is deliberately lenient on an absent content list -> empty text, no raise.
    _mock_post(monkeypatch, json_body={"unexpected": "shape"})
    result = ClaudeProvider(api_key="test-key-fake").complete("build a poster")
    assert result.text == ""
    assert result.provider == "claude"


# --- stream_chat(): system prompt first, ordered turns, SSE parsed into text chunks (AC65) ---

_TURNS = [
    ChatMessage("user", "find events in Galway"),
    ChatMessage("assistant", "Harbour Festival is on."),
    ChatMessage("user", "when is it?"),
]


def _capture_stream(monkeypatch, events: list[str]) -> list[dict]:
    """Patch ``httpx.stream`` to record each request and replay synthetic SSE ``data:`` lines."""
    sent: list[dict] = []

    @contextmanager
    def _fake_stream(method, url, **kwargs):
        sent.append({"url": url, **kwargs})
        body = "".join(f"data: {e}\n\n" for e in events)
        yield httpx.Response(200, text=body, request=httpx.Request(method, url))

    monkeypatch.setattr(httpx, "stream", _fake_stream)
    return sent


def test_gemini_stream_chat_sends_system_turns_and_parses_chunks(monkeypatch):
    sent = _capture_stream(
        monkeypatch,
        [
            json.dumps({"candidates": [{"content": {"parts": [{"text": "Hi "}]}}]}),
            json.dumps({"candidates": [{"content": {"parts": [{"text": "there"}]}}]}),
            json.dumps({"candidates": [{"finishReason": "STOP"}]}),
        ],
    )
    provider = GeminiProvider(api_key="test-key-fake", model="gemini-2.5-flash")
    assert list(provider.stream_chat("SYSTEM GUIDE", _TURNS, max_tokens=900)) == ["Hi ", "there"]
    req = sent[0]
    assert req["url"].endswith(":streamGenerateContent")
    assert req["params"]["alt"] == "sse"
    body = req["json"]
    assert body["systemInstruction"] == {"parts": [{"text": "SYSTEM GUIDE"}]}
    assert [c["role"] for c in body["contents"]] == ["user", "model", "user"]
    assert body["contents"][2]["parts"][0]["text"] == "when is it?"
    assert body["generationConfig"]["maxOutputTokens"] == 900
    assert body["generationConfig"]["thinkingConfig"] == {"thinkingBudget": 0}


def test_claude_stream_chat_marks_system_cacheable(monkeypatch):
    sent = _capture_stream(
        monkeypatch,
        [
            json.dumps({"type": "message_start"}),
            json.dumps(
                {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "ok"}}
            ),
            json.dumps({"type": "message_stop"}),
        ],
    )
    out = list(ClaudeProvider(api_key="test-key-fake").stream_chat("SYSTEM GUIDE", _TURNS))
    assert out == ["ok"]
    body = sent[0]["json"]
    assert body["stream"] is True
    assert body["system"][0]["text"] == "SYSTEM GUIDE"
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert [m["role"] for m in body["messages"]] == ["user", "assistant", "user"]


def test_openai_stream_chat_leads_with_system(monkeypatch):
    sent = _capture_stream(
        monkeypatch,
        [json.dumps({"choices": [{"delta": {"content": "ok"}}]}), "[DONE]"],
    )
    out = list(OpenAIProvider(api_key="test-key-fake").stream_chat("SYSTEM GUIDE", _TURNS))
    assert out == ["ok"]
    body = sent[0]["json"]
    assert body["stream"] is True
    assert body["messages"][0] == {"role": "system", "content": "SYSTEM GUIDE"}
    assert [m["role"] for m in body["messages"][1:]] == ["user", "assistant", "user"]


def test_stream_chat_raises_on_http_error(monkeypatch):
    @contextmanager
    def _fail(method, url, **kwargs):
        yield httpx.Response(500, text="boom", request=httpx.Request(method, url))

    monkeypatch.setattr(httpx, "stream", _fail)
    with pytest.raises(httpx.HTTPStatusError):
        list(GeminiProvider(api_key="test-key-fake").stream_chat("S", _TURNS))


def test_default_stream_chat_flattens_into_complete():
    # A provider without a native stream_chat() (the stub) still answers, deterministically.
    stub = StubProvider()
    a = list(stub.stream_chat("SYSTEM GUIDE", _TURNS))
    assert a == list(stub.stream_chat("SYSTEM GUIDE", _TURNS))
    assert len(a) == 1 and "SYSTEM GUIDE" in a[0]

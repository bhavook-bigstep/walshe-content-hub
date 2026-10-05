"""AC16 — provider abstraction: config-selected, env keys, stub fallback, no network."""

from __future__ import annotations

import httpx
import pytest

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

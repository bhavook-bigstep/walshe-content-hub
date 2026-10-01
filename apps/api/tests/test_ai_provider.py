"""AC16 — provider abstraction: config-selected, env keys, stub fallback, no network."""
from __future__ import annotations

import httpx
import pytest

from app.ai.factory import get_provider
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

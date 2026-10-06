"""AC52 — AI image generation seam: config-selected provider, deterministic stub fallback."""

from __future__ import annotations

import base64

import httpx
import pytest

from app.ai import images
from app.config import Settings


def _settings(**over) -> Settings:
    base = dict(
        database_url="sqlite+pysqlite:///:memory:",
        jwt_secret="test-secret-fixed",
        ai_image_provider="gemini",
        ai_image_model="nano-banana-2",
        gemini_api_key=None,
    )
    base.update(over)
    return Settings(**base)


def test_stub_is_deterministic_and_is_a_png():
    s = _settings()  # no key → stub
    a = images.generate_image(s, "a sunset over Galway")
    b = images.generate_image(s, "a sunset over Galway")
    assert a.provider == "stub"
    assert a.content_type == "image/png"
    assert a.data == b.data
    assert a.data[:8] == b"\x89PNG\r\n\x1a\n"


def test_different_prompts_give_different_stub_images():
    s = _settings()
    assert images.generate_image(s, "cliffs").data != images.generate_image(s, "harbour").data


def test_gemini_used_when_key_present(monkeypatch):
    pixel = b"\x89PNG\r\n\x1a\nFAKEJPEGBYTES"
    encoded = base64.b64encode(pixel).decode()
    payload = {
        "candidates": [
            {"content": {"parts": [{"inlineData": {"mimeType": "image/jpeg", "data": encoded}}]}}
        ]
    }

    captured: dict = {}

    def fake_post(url, **kwargs):  # no real network (testing.md: mock boundaries)
        captured["url"] = url
        return httpx.Response(200, json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(images.httpx, "post", fake_post)
    s = _settings(gemini_api_key="test-key-xxxx")
    out = images.generate_image(s, "a castle")
    assert out.provider == "gemini"
    assert out.model == "nano-banana-2"
    assert out.content_type == "image/jpeg"
    assert out.data == pixel
    # The configured model is injected into the endpoint path.
    assert "nano-banana-2" in captured["url"]


def test_gemini_failure_falls_back_to_stub(monkeypatch):
    def boom(url, **kwargs):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(images.httpx, "post", boom)
    s = _settings(gemini_api_key="test-key-xxxx")
    out = images.generate_image(s, "a castle")
    assert out.provider == "stub"
    assert out.data[:8] == b"\x89PNG\r\n\x1a\n"


@pytest.mark.parametrize("provider", ["", "unknown", "openai"])
def test_non_gemini_provider_uses_stub(provider):
    # No image path for other providers yet → deterministic stub (never a network call).
    s = _settings(ai_image_provider=provider, gemini_api_key="test-key-xxxx")
    assert images.generate_image(s, "x").provider == "stub"

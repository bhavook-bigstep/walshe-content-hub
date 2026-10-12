"""Gemini TTS for narration — WAV when a key is set, else None (local say/espeak fallback).

Hermetic (Contract 4): no key → None with no network; the Gemini path is exercised with a stubbed
httpx so no real call is made.
"""

from __future__ import annotations

import base64
import io
import wave

import pytest

from app.ai import tts as tts_mod
from app.ai.tts import pcm_to_wav, synthesize_speech
from app.config import Settings


def _settings(**over) -> Settings:
    base = {"jwt_secret": "x" * 48, "database_url": "sqlite://"}
    base.update(over)
    return Settings(**base)


def test_pcm_to_wav_wraps_samples_in_a_readable_wav():
    pcm = b"\x00\x01" * 100  # 100 little-endian 16-bit samples
    data = pcm_to_wav(pcm, rate=24000)
    with wave.open(io.BytesIO(data), "rb") as w:
        assert w.getnchannels() == 1
        assert w.getsampwidth() == 2
        assert w.getframerate() == 24000
        assert w.getnframes() == 100


def test_rate_parsed_from_mime():
    assert tts_mod._rate_from_mime("audio/L16;rate=16000") == 16000
    assert tts_mod._rate_from_mime("audio/pcm") == 24000  # default
    assert tts_mod._rate_from_mime(None) == 24000


def test_synthesize_returns_none_without_a_key():
    # Default provider is gemini but no key → None (no network), so the pipeline uses say/espeak.
    assert synthesize_speech(_settings(), "Hello there") is None
    assert synthesize_speech(_settings(gemini_api_key="k"), "   ") is None  # blank text
    assert synthesize_speech(_settings(gemini_api_key="k", ai_tts_provider="off"), "hi") is None


def test_synthesize_uses_gemini_when_configured(monkeypatch):
    pcm = b"\x02\x03" * 50
    captured = {}

    class _Resp:
        def raise_for_status(self):
            pass

        def json(self):
            part = {
                "inlineData": {
                    "mimeType": "audio/L16;rate=24000",
                    "data": base64.b64encode(pcm).decode(),
                }
            }
            return {"candidates": [{"content": {"parts": [part]}}]}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["key"] = kwargs["params"]["key"]
        captured["voice"] = kwargs["json"]["generationConfig"]["speechConfig"]
        return _Resp()

    monkeypatch.setattr(tts_mod.httpx, "post", fake_post)
    out = synthesize_speech(_settings(gemini_api_key="secret-key"), "Discover Galway", voice="Puck")
    assert out is not None
    with wave.open(io.BytesIO(out), "rb") as w:
        assert w.getframerate() == 24000 and w.getnframes() == 50
    assert "gemini-2.5-flash-preview-tts" in captured["url"]
    assert captured["key"] == "secret-key"
    assert captured["voice"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] == "Puck"


def test_synthesize_degrades_to_none_on_provider_error(monkeypatch):
    def boom(url, **kwargs):
        raise RuntimeError("network down")

    monkeypatch.setattr(tts_mod.httpx, "post", boom)
    assert synthesize_speech(_settings(gemini_api_key="k"), "hi") is None  # never raises


@pytest.mark.parametrize("voice", ["Kore", "Puck"])
def test_voice_defaults_to_settings(monkeypatch, voice):
    seen = {}
    monkeypatch.setattr(
        tts_mod, "_gemini_tts", lambda key, model, text, v: seen.setdefault("voice", v) or b"wav"
    )
    synthesize_speech(_settings(gemini_api_key="k", ai_tts_voice=voice), "hi")
    assert seen["voice"] == voice

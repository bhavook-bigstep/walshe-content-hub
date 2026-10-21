"""Text-to-speech for video narration.

Gemini TTS (``gemini-2.5-flash-preview-tts``) when ``gemini_api_key`` is set, returning a mixable
WAV; otherwise ``None`` so the video pipeline falls back to the local ``say``/``espeak`` tools (and
to silence when neither exists). The Gemini model returns raw 16-bit PCM, which we wrap in a WAV
container here so ffmpeg can read it.

Contract 2: the key is read from env/Settings and passed only as the request's ``key`` query param —
never logged. Contract 4: no key → ``None`` (no network), so tests stay hermetic and deterministic.
"""

from __future__ import annotations

import base64
import io
import logging
import re
import wave

import httpx

from app.config import Settings
from app.observability.tracing import traced

logger = logging.getLogger("app.ai.tts")

_GEMINI_TTS_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
_DEFAULT_RATE = 24000  # Gemini TTS emits 24 kHz mono 16-bit PCM


def pcm_to_wav(
    pcm: bytes, *, rate: int = _DEFAULT_RATE, channels: int = 1, sampwidth: int = 2
) -> bytes:
    """Wrap raw little-endian PCM in a WAV container (so ffmpeg can read the Gemini audio)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(sampwidth)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    return buf.getvalue()


def _rate_from_mime(mime: str | None) -> int:
    """Pull the sample rate out of a mime type like ``audio/L16;rate=24000`` (default 24 kHz)."""
    if mime:
        m = re.search(r"rate=(\d+)", mime)
        if m:
            return int(m.group(1))
    return _DEFAULT_RATE


def _gemini_tts(api_key: str, model: str, text: str, voice: str) -> bytes:
    resp = httpx.post(
        _GEMINI_TTS_ENDPOINT.format(model=model),
        params={"key": api_key},  # referenced, never logged (Contract 2)
        headers={"content-type": "application/json"},
        json={
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
            },
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    for part in data["candidates"][0]["content"]["parts"]:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            pcm = base64.b64decode(inline["data"])
            rate = _rate_from_mime(inline.get("mimeType") or inline.get("mime_type"))
            return pcm_to_wav(pcm, rate=rate)
    raise ValueError("Gemini TTS response contained no inline audio data")


@traced("tts", "llm")
def synthesize_speech(settings: Settings, text: str, *, voice: str | None = None) -> bytes | None:
    """Return WAV audio for ``text`` via Gemini TTS, or ``None`` to defer to the local fallback.

    ``None`` whenever Gemini TTS isn't configured (no key / provider not gemini) or the call fails —
    the caller then uses ``say``/``espeak``. Never raises.
    """
    text = (text or "").strip()
    if not text:
        return None
    if (settings.ai_tts_provider or "").lower() != "gemini" or not settings.gemini_api_key:
        return None
    try:
        logger.info("Synthesizing narration with gemini TTS (model %s)", settings.ai_tts_model)
        return _gemini_tts(
            settings.gemini_api_key, settings.ai_tts_model, text, voice or settings.ai_tts_voice
        )
    except Exception:  # noqa: BLE001 — any provider/network error degrades to the local fallback
        logger.warning("Gemini TTS failed; falling back to the local speech tool")
        return None

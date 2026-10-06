"""AI image generation (AC52).

One seam, config-selected (``ai_image_provider`` / ``ai_image_model``), with a deterministic stub
fallback — mirroring the text-provider pattern in ``app.ai.factory``. A real model is called only
when its key is present; otherwise a hermetic, deterministic solid-colour PNG stand-in, so dev and
tests never make a network call and the same prompt always yields the same bytes (Contract 4).

The key is referenced for the request only, never logged (Contract 2).
"""

from __future__ import annotations

import base64
import logging
import struct
import zlib
from dataclasses import dataclass

import httpx

from app.config import Settings

logger = logging.getLogger("app.ai")

# Gemini image generation shares the generateContent surface but returns inline image data.
_GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


@dataclass(frozen=True)
class GeneratedImage:
    data: bytes
    content_type: str
    provider: str
    model: str


def solid_png(rgb: tuple[int, int, int], size: int = 32) -> bytes:
    """A deterministic solid-colour PNG — the hermetic PoC stand-in for a generated image."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        crc = struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + body + crc

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    raw = (b"\x00" + bytes(rgb) * size) * size
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def _stub_image(prompt: str, model: str) -> GeneratedImage:
    """Deterministic stand-in: the prompt (+ model) seeds a stable solid colour."""
    seed = zlib.crc32(f"{model}|{prompt.strip().lower()}".encode())
    rgb = ((seed >> 16) & 0xFF, (seed >> 8) & 0xFF, seed & 0xFF)
    return GeneratedImage(solid_png(rgb), "image/png", "stub", "stub-image-1")


def _gemini_image(api_key: str, model: str, prompt: str) -> GeneratedImage:
    resp = httpx.post(
        _GEMINI_ENDPOINT.format(model=model),
        params={"key": api_key},  # referenced, never logged (Contract 2)
        headers={"content-type": "application/json"},
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    for part in data["candidates"][0]["content"]["parts"]:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            raw = base64.b64decode(inline["data"])
            content_type = inline.get("mimeType") or inline.get("mime_type") or "image/png"
            return GeneratedImage(raw, content_type, "gemini", model)
    raise ValueError("Gemini response contained no inline image data")


def generate_image(settings: Settings, prompt: str) -> GeneratedImage:
    """Generate an image for ``prompt`` using the configured provider, or a deterministic stub.

    Gemini ("nano-banana-2" by default) is used only when ``gemini_api_key`` is set; any failure
    degrades to the stub rather than raising, so a cover is always produced.
    """
    provider = (settings.ai_image_provider or "").lower()
    model = settings.ai_image_model
    if provider == "gemini" and settings.gemini_api_key:
        try:
            logger.info("Generating image with gemini (model %s)", model)
            return _gemini_image(settings.gemini_api_key, model, prompt)
        except Exception:  # noqa: BLE001 — any provider/network error degrades to the stub
            logger.warning("Image provider gemini failed; using deterministic stub")
            return _stub_image(prompt, model)
    logger.info("No image model key; using deterministic stub for image generation")
    return _stub_image(prompt, model)

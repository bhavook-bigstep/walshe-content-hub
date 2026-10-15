"""AI vision critique seam (AC102).

Mirrors ``app.ai.images``: config-selected (``ai_vision_provider`` / ``ai_vision_model``), a real
Gemini vision model is called only when ``gemini_api_key`` is present, otherwise a deterministic
stub keyed on a hash of the scene JSON (not pixels) so dev and tests are hermetic and
reproducible (Contract 4). The key is referenced for the request only, never logged (Contract 2).
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from collections.abc import Sequence
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger("app.ai")

_GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

IMAGE_CHECKLIST: tuple[str, ...] = (
    "layout",
    "visual-hierarchy",
    "contrast",
    "element-bounds-clipping",
    "legibility",
    "broken-images",
)
VIDEO_CHECKLIST: tuple[str, ...] = ("motion-continuity",)

_SEVERITIES = ("info", "warn", "fail")


def checklist_for(mode: str) -> tuple[str, ...]:
    if mode == "video":
        return VIDEO_CHECKLIST
    if mode == "image":
        return IMAGE_CHECKLIST
    raise ValueError(f"unknown critique mode: {mode!r}")


def _scene_hash(scene: Any) -> str:
    canon = json.dumps(scene, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canon.encode()).hexdigest()


def _stub_critique(scene: Any, checklist: Sequence[str]) -> dict:
    """Deterministic stand-in: each checklist item's verdict is derived from the scene-JSON hash."""
    digest = _scene_hash(scene)
    issues = []
    for i, item in enumerate(checklist):
        byte = int(digest[(i * 2) % len(digest) : (i * 2) % len(digest) + 2], 16)
        if byte % 4 == 0:
            issues.append(
                {"category": item, "severity": "warn", "note": f"stub: possible {item} issue"}
            )
    return {
        "provider": "stub",
        "model": "stub-vision-1",
        "ok": not issues,
        "issues": issues,
        "summary": "stub critique" + ("" if issues else ": no issues"),
        "scene_hash": digest,
    }


def _prompt(checklist: Sequence[str]) -> str:
    return (
        "You are a design QA reviewer. Inspect the attached rendered frame(s) and check: "
        + ", ".join(checklist)
        + '. Reply with JSON only: {"ok": bool, "summary": str, "issues": '
        '[{"category": str, "severity": "info"|"warn"|"fail", "note": str}]}.'
    )


def _parse_critique(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("vision response was not a JSON object")
    issues = []
    for raw in data.get("issues") or []:
        sev = raw.get("severity", "warn")
        issues.append(
            {
                "category": str(raw.get("category", "")),
                "severity": sev if sev in _SEVERITIES else "warn",
                "note": str(raw.get("note", "")),
            }
        )
    ok = data.get("ok")
    return {
        "ok": bool(ok) if ok is not None else not issues,
        "issues": issues,
        "summary": str(data.get("summary", "")),
    }


def _gemini_critique(
    api_key: str, model: str, pngs: Sequence[bytes], checklist: Sequence[str]
) -> dict:
    parts: list[dict] = [{"text": _prompt(checklist)}]
    for png in pngs:
        parts.append(
            {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(png).decode()}}
        )
    resp = httpx.post(
        _GEMINI_ENDPOINT.format(model=model),
        params={"key": api_key},  # referenced, never logged (Contract 2)
        headers={"content-type": "application/json"},
        json={
            "contents": [{"parts": parts}],
            "generationConfig": {"responseMimeType": "application/json"},
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    body = resp.json()
    text = "".join(
        p.get("text", "") for p in body["candidates"][0]["content"]["parts"] if "text" in p
    )
    if not text:
        raise ValueError("Gemini response contained no text")
    out = _parse_critique(text)
    out.update({"provider": "gemini", "model": model})
    return out


def critique_scene(
    settings: Settings,
    pngs: Sequence[bytes],
    checklist: Sequence[str] | None = None,
    mode: str = "image",
    scene: Any = None,
) -> dict:
    """Critique rendered frame(s) with the configured vision model, or a deterministic stub.

    ``checklist`` overrides the ``mode`` default ("image" or "video"). ``scene`` is the scene JSON
    that keys the stub. Any provider failure degrades to the stub rather than raising.
    """
    items = tuple(checklist) if checklist else checklist_for(mode)
    provider = (settings.ai_vision_provider or "").lower()
    model = settings.ai_vision_model
    if provider == "gemini" and settings.gemini_api_key:
        try:
            logger.info("Critiquing scene with gemini (model %s)", model)
            return _gemini_critique(settings.gemini_api_key, model, pngs, items)
        except Exception:  # noqa: BLE001 — any provider/network error degrades to the stub
            logger.warning("Vision provider gemini failed; using deterministic stub")
            return _stub_critique(scene, items)
    logger.info("No vision model key; using deterministic stub for scene critique")
    return _stub_critique(scene, items)

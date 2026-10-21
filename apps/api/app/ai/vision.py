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
        "You are a strict design QA reviewer. Inspect the attached rendered frame(s) and check: "
        + ", ".join(checklist)
        + ".\nTHE STANDARD — a scene PASSES (empty issues list) ONLY if ALL hold: (1) all text is "
        "crisp and readable with strong contrast against what's behind it; (2) layering is "
        "intentional — text OVER a photo, scrim or shape is fine and often good, but TWO readable "
        "text blocks must NOT sit on top of each other (both become illegible), and nothing is cut "
        "off or sits outside the frame / its margins; (3) there is ONE clear focal point "
        "and a legible hierarchy (a dominant headline, then supporting text); (4) the layout is "
        "balanced and intentional — not sparse/empty, not cramped/cluttered, aligned to a grid; "
        "(5) every image actually loaded (no blank/broken boxes); (6) a cohesive palette. If ANY "
        "of these fails, it does NOT pass — report it. Hold work to a professional bar.\n"
        + "Report only DISTINCT, concrete problems — AT MOST 4, each a different issue; never "
        "repeat or restate the same problem, and dedupe overlapping ones. If the frame looks good, "
        "return an empty issues list. For each issue, give its LOCATION on the frame (e.g. "
        "'headline', 'top-left', 'the logo', 'center') and ONE concrete fix. "
        "SEVERITY — be decisive: 'fail' = clearly broken (unreadable text, low contrast, elements "
        "overlapping or cut off / off-canvas, a broken or empty image, nothing composed); 'warn' = "
        "it works but should be improved (weak hierarchy, cramped spacing, awkward alignment); "
        "'info' = minor polish only. Mark real, fixable problems 'fail' or 'warn', not 'info'. "
        'Reply with JSON only: {"ok": bool, "summary": str, "issues": '
        '[{"category": str, "severity": "info"|"warn"|"fail", "location": str, "note": str}]}.'
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
                "location": str(raw.get("location", "")),
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
        except httpx.HTTPStatusError as e:  # degrade to stub, but make WHY visible (not the key)
            # A silent stub fallback once masked a RETIRED model id (404) as a working review, so
            # the loop "reviewed" with noise. Surface the status + provider message (neither
            # contains the key; the key lives only in the query param, never logged — Contract 2).
            logger.warning(
                "Vision provider gemini failed (model %s): HTTP %s %s — using deterministic stub",
                model, e.response.status_code, (e.response.text or "")[:200].replace("\n", " "),
            )
            return _stub_critique(scene, items)
        except Exception as e:  # noqa: BLE001 — any other provider/network error degrades to the stub
            logger.warning(
                "Vision provider gemini failed (model %s): %s — using deterministic stub",
                model, type(e).__name__,
            )
            return _stub_critique(scene, items)
    logger.info("No vision model key; using deterministic stub for scene critique")
    return _stub_critique(scene, items)

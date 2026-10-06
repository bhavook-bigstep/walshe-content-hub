"""Auto-Catalog tool-call agent (AC73).

Turns the distilled tourism facts (from ``app.ai.extract`` stage 1) plus the count of images the
document yielded into a list of **proposed draft entries**, each optionally carrying the index of
the extracted image to use as its cover.

The agent exposes a two-tool contract to the model — ``create_entries(entries_json)`` and
``attach_image(entry_ref, image_ref)`` — and the **server validates every call** before anything is
persisted (valid ``type``, grounded fields via ``_normalize_entry``; ``image_ref`` must index a real
extracted image). Invalid/ungrounded ops are dropped — nothing is fabricated into a published state
(Contract 1: the caller still stores every result as a hidden draft).

Determinism (Contract 4): with the stub provider (no key), an empty/unusable response, or a provider
failure, a deterministic fallback builds entries from the same facts via
``extract._heuristic_entries`` and attaches images by order (entry *i* gets image *i*). So the stub
path needs no network and the same document always yields the same proposals.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.ai.base import AIProvider
from app.ai.extract import (
    _MAX_ENTRIES,
    _heuristic_entries,
    _normalize_entry,
)
from app.models.catalog import CatalogType

logger = logging.getLogger("app.ai.catalog_agent")

# The key added to each normalized entry dict: the index into the document's extracted images to use
# as this entry's cover, or ``None`` for no cover.
IMAGE_INDEX_KEY = "_image_index"


def _tool_instruction(facts: str, image_count: int) -> str:
    types = ", ".join(t.value for t in CatalogType)
    return (
        "You are a tourism catalog agent. From the facts below, create draft catalog entries by "
        "emitting a JSON array of tool calls. Two tools are available:\n"
        f'  {{"op":"create_entries","entries":[<entry>, ...]}} — each <entry> has "type" '
        f'(one of: {types}), "title", "description", "destination", "country", "state", "city", '
        '"season" (spring/summer/autumn/winter/year_round), "attributes" (object of the type\'s '
        'template fields), "highlights" (array), "market_tags" (array). Only grounded fields.\n'
        f'  {{"op":"attach_image","entry_ref":<0-based index among created entries>,'
        f'"image_ref":<0-based index, 0..{max(image_count - 1, 0)}>}} — attach one of the '
        f"{image_count} extracted image(s) as that entry's cover.\n"
        "Use ONLY information in the facts; never invent facts. Reply with the JSON array only.\n\n"
        "FACTS:\n" + facts
    )


def _parse_tool_ops(text: str, image_count: int) -> list[dict[str, Any]] | None:
    """Validate the model's tool-call array into normalized entry dicts (each with an image index),
    or ``None`` if nothing usable — so the caller falls back to the deterministic path.

    Server-side validation: entries go through ``_normalize_entry`` (drops title-less/ill-typed);
    an ``attach_image`` op is honoured only when both refs are in range of what actually exists.
    """
    try:
        raw = json.loads(text)
    except (ValueError, TypeError):
        return None
    if isinstance(raw, dict):
        raw = raw.get("ops", [raw])
    if not isinstance(raw, list):
        return None

    entries: list[dict[str, Any]] = []
    attachments: list[tuple[int, int]] = []
    for op in raw:
        if not isinstance(op, dict):
            continue
        kind = op.get("op")
        if kind == "create_entries":
            for item in op.get("entries", []):
                if not isinstance(item, dict):
                    continue
                entry = _normalize_entry(item)
                if entry is not None:
                    entry[IMAGE_INDEX_KEY] = None
                    entries.append(entry)
                if len(entries) >= _MAX_ENTRIES:
                    break
        elif kind == "attach_image":
            entry_ref, image_ref = op.get("entry_ref"), op.get("image_ref")
            if isinstance(entry_ref, int) and isinstance(image_ref, int):
                attachments.append((entry_ref, image_ref))
    if not entries:
        return None
    # Apply attachments only now that the full entry list is known (refs validated against it).
    for entry_ref, image_ref in attachments:
        if 0 <= entry_ref < len(entries) and 0 <= image_ref < image_count:
            entries[entry_ref][IMAGE_INDEX_KEY] = image_ref
    return entries


def _fallback(facts: str, image_count: int) -> list[dict[str, Any]]:
    """Deterministic path (Contract 4): heuristic entries + images attached by order."""
    entries = _heuristic_entries(facts)
    for index, entry in enumerate(entries):
        entry[IMAGE_INDEX_KEY] = index if index < image_count else None
    return entries


def plan_entries(facts: str, image_count: int, provider: AIProvider) -> list[dict[str, Any]]:
    """Run the tool-call loop and return normalized entry dicts, each with an ``_image_index``
    (int into the extracted images, or ``None``). Falls back deterministically on the stub, an
    unusable response, or any provider failure — a flaky provider must never 500 the job (AC71)."""
    if provider.name != "stub" and facts.strip():
        try:
            completion = provider.complete(_tool_instruction(facts, image_count), max_tokens=2048)
        except Exception:  # noqa: BLE001 - any provider error degrades to the deterministic path
            logger.info("catalog-agent provider call failed; falling back to heuristic")
            return _fallback(facts, image_count)
        parsed = _parse_tool_ops(completion.text, image_count)
        if parsed is not None:
            return parsed
    return _fallback(facts, image_count)

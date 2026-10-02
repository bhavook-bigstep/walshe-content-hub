"""AI Builder (AC10): prompt + selected catalog items -> a ``DesignDoc`` of place / write-copy ops.

Talks only to the AC16 ``AIProvider`` abstraction. The deterministic stub provider (no key) yields a
fixed layout derived solely from the selected items, so the demo and tests are reproducible with no
network. For a real provider the model is asked (tool-use style) for a JSON list of ops; every op is
validated against the selected items so ungrounded output is dropped, and an unusable response falls
back to the deterministic layout. Output is shaped like the render pipeline's ``design`` dict
(``pages[].nodes[]``) so it can be passed straight to ``/render``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.ai.base import AIProvider

_PAGE_W, _PAGE_H = 595, 842
_MARGIN = 48
_ROW_H = 120
_MAX_COPY = 600


@dataclass(frozen=True)
class BuilderItem:
    """A selected catalog item the design may reference (and nothing else)."""

    id: int
    title: str
    destination: str = ""
    description: str = ""


@dataclass(frozen=True)
class DesignDoc:
    prompt: str
    provider: str
    ops: list[dict[str, Any]] = field(default_factory=list)
    pages: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "prompt": self.prompt,
            "provider": self.provider,
            "ops": self.ops,
            "pages": self.pages,
        }


def _stub_ops(prompt: str, items: list[BuilderItem]) -> list[dict[str, Any]]:
    """Fixed layout: a headline, then per item a place op and a write-copy op."""
    ops: list[dict[str, Any]] = [
        {
            "op": "write-copy",
            "item_id": None,
            "slot": "headline",
            "text": prompt.strip()[:120] or "Discover Ireland",
        }
    ]
    for index, item in enumerate(items):
        ops.append({"op": "place", "item_id": item.id, "slot": f"item-{index}"})
        where = f" in {item.destination}" if item.destination else ""
        ops.append(
            {
                "op": "write-copy",
                "item_id": item.id,
                "slot": f"item-{index}",
                "text": f"{item.title}{where}",
            }
        )
    return ops


def _instruction(prompt: str, items: list[BuilderItem]) -> str:
    catalog = [{"id": i.id, "title": i.title, "destination": i.destination} for i in items]
    return (
        "You are a travel design assistant. Using ONLY the catalog items below, reply with a JSON "
        'list of ops. Each op is {"op":"place","item_id":<id>} or '
        '{"op":"write-copy","item_id":<id or null>,"text":<string>}. Never mention anything '
        f"outside these items.\nBrief: {prompt}\nItems: {json.dumps(catalog, sort_keys=True)}"
    )


def _parse_ops(text: str, items: list[BuilderItem]) -> list[dict[str, Any]] | None:
    """Validate model output against the selected items; ``None`` if nothing usable."""
    try:
        raw = json.loads(text)
    except (ValueError, TypeError):
        return None
    if isinstance(raw, dict):
        raw = raw.get("ops")
    if not isinstance(raw, list):
        return None
    valid_ids = {i.id for i in items}
    ops: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        kind, item_id = entry.get("op"), entry.get("item_id")
        if kind == "place" and item_id in valid_ids:
            ops.append({"op": "place", "item_id": item_id, "slot": f"item-{len(ops)}"})
        elif kind == "write-copy" and (item_id is None or item_id in valid_ids):
            copy = entry.get("text")
            if isinstance(copy, str) and copy.strip():
                ops.append(
                    {
                        "op": "write-copy",
                        "item_id": item_id,
                        "slot": "headline" if item_id is None else f"item-{len(ops)}",
                        "text": copy.strip()[:_MAX_COPY],
                    }
                )
    return ops or None


def _layout(ops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn ops into a single page of text nodes with fixed, deterministic coordinates."""
    nodes: list[dict[str, Any]] = []
    y = _MARGIN
    for op in ops:
        if op["op"] != "write-copy":
            continue
        nodes.append(
            {
                "type": "text",
                "text": op["text"],
                "item_id": op["item_id"],
                "x": _MARGIN,
                "y": y,
                "w": _PAGE_W - 2 * _MARGIN,
            }
        )
        y += _ROW_H
    return [{"width": _PAGE_W, "height": _PAGE_H, "nodes": nodes}]


def build_design(prompt: str, items: list[BuilderItem], provider: AIProvider) -> DesignDoc:
    """Build a design from ``prompt`` grounded in ``items`` using ``provider``."""
    ops: list[dict[str, Any]] | None = None
    if provider.name != "stub":
        completion = provider.complete(_instruction(prompt, items), max_tokens=1024)
        ops = _parse_ops(completion.text, items)
    if ops is None:
        ops = _stub_ops(prompt, items)
    return DesignDoc(prompt=prompt, provider=provider.name, ops=ops, pages=_layout(ops))

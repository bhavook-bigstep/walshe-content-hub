"""Curated colour palettes for the Studio Builder (AC104).

Beautiful visuals don't come from an LLM inventing hex codes — they come from composing inside a
cohesive, high-contrast palette. Each palette here is hand-tuned with four ROLES the builder maps
onto a scene via ``apply_theme``:

- ``bg``      — the scene background
- ``surface`` — large shapes / scrims / cards (a step off the background)
- ``ink``     — primary readable text (always strong contrast against ``bg``)
- ``accent``  — small accent shapes + accent text (eyebrows, CTAs, rules)

Light palettes carry dark ``ink`` on a light ``bg``; dark palettes the reverse — so text stays
readable whichever is chosen. Keeping these in ONE place (Python) lets both ``list_palettes`` and
``apply_theme`` use them without duplication.
"""

from __future__ import annotations

from typing import Any

PALETTES: list[dict[str, str]] = [
    {"id": "coastal-calm", "name": "Coastal Calm", "mood": "airy, serene, seaside",
     "bg": "#0A4D68", "surface": "#08384D", "ink": "#EAF4F8", "accent": "#F4B860"},
    {"id": "sunset-warm", "name": "Sunset Warm", "mood": "warm, golden, inviting",
     "bg": "#2A1A2E", "surface": "#3D2740", "ink": "#FDF0E6", "accent": "#FF8C42"},
    {"id": "forest-fresh", "name": "Forest Fresh", "mood": "natural, grounded, calm",
     "bg": "#14281D", "surface": "#1E3A2B", "ink": "#EAF3EC", "accent": "#8FC93A"},
    {"id": "midnight-lux", "name": "Midnight Lux", "mood": "premium, elegant, dark",
     "bg": "#0E1116", "surface": "#1A1F27", "ink": "#F2F4F8", "accent": "#C9A24B"},
    {"id": "editorial-mono", "name": "Editorial Mono", "mood": "clean, modern, minimal light",
     "bg": "#FAFAF7", "surface": "#EDEDE8", "ink": "#1A1A1A", "accent": "#E4572E"},
    {"id": "desert-luxe", "name": "Desert Luxe", "mood": "earthy, warm, luxe",
     "bg": "#2B2118", "surface": "#3C2E20", "ink": "#F6EEE3", "accent": "#E0A458"},
    {"id": "tropical-pop", "name": "Tropical Pop", "mood": "vibrant, playful, bold",
     "bg": "#00635D", "surface": "#00807A", "ink": "#FFFFFF", "accent": "#FFD23F"},
    {"id": "alpine-cool", "name": "Alpine Cool", "mood": "crisp, clean, fresh light",
     "bg": "#F4F7FA", "surface": "#E2EAF0", "ink": "#13283B", "accent": "#2E8BC0"},
    {"id": "heritage-rose", "name": "Heritage Rose", "mood": "classic, refined, soft",
     "bg": "#3A2226", "surface": "#4E2F34", "ink": "#F7EBE9", "accent": "#C97B84"},
    {"id": "urban-slate", "name": "Urban Slate", "mood": "modern, confident, cool",
     "bg": "#1C2227", "surface": "#2A333A", "ink": "#EEF1F3", "accent": "#4ECDC4"},
    {"id": "berry-bold", "name": "Berry Bold", "mood": "energetic, rich, youthful",
     "bg": "#2D0B2E", "surface": "#45164A", "ink": "#FBEAF6", "accent": "#FF4D8D"},
    {"id": "sage-linen", "name": "Sage Linen", "mood": "soft, organic, premium light",
     "bg": "#EFEEE6", "surface": "#DCDED0", "ink": "#2B332B", "accent": "#7A8B5A"},
    {"id": "ocean-night", "name": "Ocean Night", "mood": "deep, cinematic, cool",
     "bg": "#071A2F", "surface": "#0E2A49", "ink": "#E7F0F8", "accent": "#39A0ED"},
    {"id": "terracotta-warm", "name": "Terracotta Warm", "mood": "cozy, mediterranean, warm light",
     "bg": "#F3E9DF", "surface": "#E6D5C3", "ink": "#3A2A1E", "accent": "#C96F4A"},
]

_BY_ID: dict[str, dict[str, str]] = {p["id"]: p for p in PALETTES}


def palette_by_id(pid: str) -> dict[str, str] | None:
    return _BY_ID.get(str(pid))


def _chroma(hex_color: str) -> int:
    """How saturated a colour is (max channel − min channel). Near-grey/white/black → ~0; a vivid
    accent → large. Lets the recolour keep accent-coloured text as ACCENT and map neutral text to
    INK instead of flattening everything to one colour."""
    h = str(hex_color or "").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return 0
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return 0
    return max(r, g, b) - min(r, g, b)


def recolor_scene(scene: dict[str, Any], palette: dict[str, str], canvas_area: int) -> None:
    """Recolour one scene in place by role: background→bg, large shapes/scrims→surface, small
    shapes→accent, neutral text→ink, saturated (accent-coloured) text→accent. Opacity/positions
    are untouched, so scrims stay scrims. Mutates ``scene``."""
    scene["background"] = palette["bg"]
    for n in scene.get("nodes") or []:
        t = n.get("type")
        if t == "background":
            n["color"] = palette["bg"]
        elif t == "shape":
            area = float(n.get("width") or 0) * float(n.get("height") or 0)
            large = area >= 0.35 * max(1, canvas_area)
            n["color"] = palette["surface"] if large else palette["accent"]
        elif t == "text":
            n["color"] = palette["accent"] if _chroma(n.get("color", "")) > 40 else palette["ink"]

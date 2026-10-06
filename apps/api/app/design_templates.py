"""Built-in Design Studio templates (AC62/AC75).

A template is a full **Workspace** object — ``{metadata, reference_content, scenes}`` — the exact
shape the workspace engine loads. "Use template" seeds a new project's workspace from one of these,
so there is no special template-loading path: the studio just opens the project. Scenes are authored
as vector nodes (styled text + shapes + photo-frame placeholders) so they render on the canvas, the
PNG and the PDF alike, and stay fully editable. Node ids are plain words (never ``…-nN``) so the
studio's id generator never collides when the agent adds elements.
"""

from __future__ import annotations

from typing import Any

_INTER = "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
_SERIF = "Georgia, 'Times New Roman', serif"
_DISPLAY = "'Arial Black', Impact, sans-serif"


def _text(nid: str, s: str, x: float, y: float, w: float, size: float, **kw: Any) -> dict[str, Any]:
    return {
        "id": nid,
        "type": "text",
        "text": s,
        "x": x,
        "y": y,
        "width": w,
        "height": size * 1.4,
        "fontSize": size,
        "fontFamily": kw.pop("font", _INTER),
        "color": kw.pop("color", "#111111"),
        **kw,
    }


def _rect(
    nid: str, x: float, y: float, w: float, h: float, color: str, **kw: Any
) -> dict[str, Any]:
    return {
        "id": nid,
        "type": "shape",
        "shape": "rect",
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "color": color,
        **kw,
    }


def _ellipse(
    nid: str, x: float, y: float, w: float, h: float, color: str, **kw: Any
) -> dict[str, Any]:
    return {
        "id": nid,
        "type": "shape",
        "shape": "ellipse",
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "color": color,
        **kw,
    }


def _scene(sid: str, name: str, background: str, nodes: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": sid,
        "name": name,
        "durationMs": 4000,
        "transition": "fade",
        "background": background,
        "nodes": nodes,
    }


def _workspace(name: str, fmt: str, w: int, h: int, scenes: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "metadata": {"name": name, "format": fmt, "width": w, "height": h, "version": 1},
        "reference_content": {"collections": [], "uploads": [], "generated": []},
        "scenes": scenes,
    }


# ── Template 1: Destination poster (story, 1080×1920) ──────────────────────────────────────────
_POSTER = _workspace(
    "Destination Poster",
    "story",
    1080,
    1920,
    [
        _scene(
            "scene-n1",
            "Poster",
            "#0b3d3a",
            [
                # Hero photo zone (top ~60%); the agent drops a real catalog photo over it.
                _rect("photo", 0, 0, 1080, 1180, "#14716a", radius=0),
                _text(
                    "photo_hint",
                    "Drag a photo here",
                    0,
                    560,
                    1080,
                    40,
                    color="#d1faf4",
                    textAlign="center",
                    opacity=0.85,
                ),
                # Accent bar + eyebrow.
                _rect("accent", 80, 1240, 120, 10, "#f59e0b", radius=5),
                _text(
                    "eyebrow", "DESTINATION", 80, 1280, 920, 30, color="#5eead4", fontWeight="bold"
                ),
                # Headline + subtitle.
                _text(
                    "title",
                    "Discover\nSomewhere New",
                    80,
                    1330,
                    940,
                    100,
                    color="#ffffff",
                    fontWeight="bold",
                    font=_DISPLAY,
                    lineHeight=1.02,
                ),
                _text(
                    "subtitle",
                    "A short, inviting line about the place and why to visit.",
                    80,
                    1590,
                    820,
                    40,
                    color="#e6fffb",
                    opacity=0.9,
                ),
                # CTA pill.
                _rect("cta_bg", 80, 1700, 360, 96, "#f59e0b", radius=48),
                _text(
                    "cta",
                    "Plan your trip",
                    80,
                    1728,
                    360,
                    38,
                    color="#0b3d3a",
                    fontWeight="bold",
                    textAlign="center",
                ),
            ],
        ),
    ],
)

# ── Template 2: Trip itinerary (pamphlet, 1240×1754, two pages) ────────────────────────────────
_ITINERARY = _workspace(
    "Trip Itinerary",
    "pamphlet",
    1240,
    1754,
    [
        _scene(
            "scene-n1",
            "Cover",
            "#0f172a",
            [
                _rect("photo", 0, 0, 1240, 980, "#1e293b", radius=0),
                _text(
                    "photo_hint",
                    "Drag a cover photo here",
                    0,
                    470,
                    1240,
                    36,
                    color="#cbd5e1",
                    textAlign="center",
                    opacity=0.8,
                ),
                _rect("accent", 100, 1060, 140, 10, "#38bdf8", radius=5),
                _text(
                    "eyebrow", "ITINERARY", 100, 1095, 1040, 30, color="#7dd3fc", fontWeight="bold"
                ),
                _text(
                    "title",
                    "Your Trip, Day by Day",
                    100,
                    1140,
                    1040,
                    86,
                    color="#ffffff",
                    fontWeight="bold",
                    font=_SERIF,
                    lineHeight=1.05,
                ),
                _text(
                    "meta",
                    "5 days · Oct 2026 · prepared for your client",
                    100,
                    1300,
                    1040,
                    34,
                    color="#94a3b8",
                ),
            ],
        ),
        _scene(
            "scene-n2",
            "Days",
            "#ffffff",
            [
                _text(
                    "heading",
                    "The plan",
                    100,
                    90,
                    1040,
                    56,
                    color="#0f172a",
                    fontWeight="bold",
                    font=_SERIF,
                ),
                _rect("rule", 100, 170, 1040, 4, "#e2e8f0", radius=2),
                # Day 1
                _ellipse("d1_dot", 100, 230, 56, 56, "#38bdf8"),
                _text(
                    "d1_num",
                    "1",
                    100,
                    242,
                    56,
                    32,
                    color="#ffffff",
                    fontWeight="bold",
                    textAlign="center",
                ),
                _text(
                    "d1_title",
                    "Day 1 — Arrival",
                    190,
                    232,
                    950,
                    40,
                    color="#0f172a",
                    fontWeight="bold",
                ),
                _text(
                    "d1_body",
                    "Describe the day's highlights, stays and travel here.",
                    190,
                    288,
                    950,
                    30,
                    color="#475569",
                ),
                # Day 2
                _ellipse("d2_dot", 100, 400, 56, 56, "#38bdf8"),
                _text(
                    "d2_num",
                    "2",
                    100,
                    412,
                    56,
                    32,
                    color="#ffffff",
                    fontWeight="bold",
                    textAlign="center",
                ),
                _text(
                    "d2_title",
                    "Day 2 — Explore",
                    190,
                    402,
                    950,
                    40,
                    color="#0f172a",
                    fontWeight="bold",
                ),
                _text(
                    "d2_body",
                    "Describe the day's highlights, stays and travel here.",
                    190,
                    458,
                    950,
                    30,
                    color="#475569",
                ),
                # Day 3
                _ellipse("d3_dot", 100, 570, 56, 56, "#38bdf8"),
                _text(
                    "d3_num",
                    "3",
                    100,
                    582,
                    56,
                    32,
                    color="#ffffff",
                    fontWeight="bold",
                    textAlign="center",
                ),
                _text(
                    "d3_title",
                    "Day 3 — Departure",
                    190,
                    572,
                    950,
                    40,
                    color="#0f172a",
                    fontWeight="bold",
                ),
                _text(
                    "d3_body",
                    "Describe the day's highlights, stays and travel here.",
                    190,
                    628,
                    950,
                    30,
                    color="#475569",
                ),
                # Photo strip
                _rect("photo2", 100, 760, 500, 360, "#e2e8f0", radius=16),
                _text(
                    "photo2_hint",
                    "Drag a photo here",
                    100,
                    925,
                    500,
                    28,
                    color="#94a3b8",
                    textAlign="center",
                ),
            ],
        ),
    ],
)

# id -> full workspace. Metadata for the Templates list is derived from this.
TEMPLATE_WORKSPACES: dict[str, dict[str, Any]] = {
    "destination-poster": _POSTER,
    "trip-itinerary": _ITINERARY,
}

# Human-facing descriptions for the Templates gallery.
TEMPLATE_DESCRIPTIONS: dict[str, str] = {
    "destination-poster": "A bold portrait poster: hero photo, headline and a call-to-action.",
    "trip-itinerary": "A printable two-page itinerary: cover + a day-by-day plan with photo spots.",
}

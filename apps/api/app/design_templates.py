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


def _scene(
    sid: str,
    name: str,
    background: str,
    nodes: list[dict[str, Any]],
    duration_ms: int = 4000,
    transition: str = "fade",
) -> dict[str, Any]:
    return {
        "id": sid,
        "name": name,
        "durationMs": duration_ms,
        "transition": transition,
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

# ── Template 3: Social promo (square, 1080×1080) ───────────────────────────────────────────────
_PROMO = _workspace(
    "Weekend Getaway",
    "social",
    1080,
    1080,
    [
        _scene(
            "scene-n1",
            "Promo",
            "#1e3a5f",
            [
                # Hero photo band across the top ~58%.
                _rect("photo", 0, 0, 1080, 620, "#2b5278", radius=0),
                _text(
                    "photo_hint",
                    "Drag a photo here",
                    0,
                    290,
                    1080,
                    36,
                    color="#dbe7f3",
                    textAlign="center",
                    opacity=0.85,
                ),
                _rect("accent", 72, 680, 110, 10, "#f4a62a", radius=5),
                _text(
                    "eyebrow",
                    "WEEKEND GETAWAY",
                    72,
                    712,
                    936,
                    28,
                    color="#9fc3e8",
                    fontWeight="bold",
                ),
                _text(
                    "title",
                    "Escape to the Coast",
                    72,
                    752,
                    900,
                    82,
                    color="#ffffff",
                    fontWeight="bold",
                    font=_DISPLAY,
                    lineHeight=1.04,
                ),
                _text(
                    "subtitle",
                    "Two nights, ocean views and time to slow down.",
                    72,
                    900,
                    820,
                    34,
                    color="#e6eef7",
                    opacity=0.9,
                ),
                _rect("cta_bg", 72, 968, 300, 84, "#f4a62a", radius=42),
                _text(
                    "cta",
                    "Book now",
                    72,
                    992,
                    300,
                    34,
                    color="#12263a",
                    fontWeight="bold",
                    textAlign="center",
                ),
            ],
        ),
    ],
)

# ── Template 4: Event announcement (story, 1080×1920) ──────────────────────────────────────────
_EVENT = _workspace(
    "Event Announcement",
    "story",
    1080,
    1920,
    [
        _scene(
            "scene-n1",
            "Event",
            "#3b0d2e",
            [
                _rect("photo", 0, 0, 1080, 1040, "#5a1646", radius=0),
                _text(
                    "photo_hint",
                    "Drag an event photo here",
                    0,
                    500,
                    1080,
                    38,
                    color="#f6d9ec",
                    textAlign="center",
                    opacity=0.85,
                ),
                _text(
                    "eyebrow",
                    "YOU'RE INVITED",
                    80,
                    1110,
                    920,
                    30,
                    color="#f4a6d4",
                    fontWeight="bold",
                ),
                _text(
                    "title",
                    "Harbour\nFestival",
                    80,
                    1150,
                    940,
                    104,
                    color="#ffffff",
                    fontWeight="bold",
                    font=_DISPLAY,
                    lineHeight=1.0,
                ),
                # Date/time chip.
                _rect("when_bg", 80, 1430, 560, 96, "#f4a62a", radius=16),
                _text(
                    "when",
                    "SAT 14 DEC · 6 PM",
                    80,
                    1462,
                    560,
                    40,
                    color="#3b0d2e",
                    fontWeight="bold",
                    textAlign="center",
                ),
                _text(
                    "where",
                    "Circular Quay · live music, food & fireworks",
                    80,
                    1560,
                    900,
                    34,
                    color="#f6d9ec",
                    opacity=0.92,
                ),
                _rect("cta_bg", 80, 1700, 360, 96, "#ffffff", radius=48),
                _text(
                    "cta",
                    "Get tickets",
                    80,
                    1728,
                    360,
                    38,
                    color="#3b0d2e",
                    fontWeight="bold",
                    textAlign="center",
                ),
            ],
        ),
    ],
)

# ── Template 5: Special offer (square, 1080×1080) ──────────────────────────────────────────────
_OFFER = _workspace(
    "Special Offer",
    "social",
    1080,
    1080,
    [
        _scene(
            "scene-n1",
            "Offer",
            "#0f3d2e",
            [
                _rect("photo", 540, 0, 540, 1080, "#15573f", radius=0),
                _text(
                    "photo_hint",
                    "Drag a photo here",
                    540,
                    520,
                    540,
                    30,
                    color="#cdeadd",
                    textAlign="center",
                    opacity=0.85,
                ),
                # Discount badge.
                _ellipse("badge", 56, 72, 200, 200, "#f4a62a"),
                _text(
                    "badge_pct",
                    "-20%",
                    56,
                    138,
                    200,
                    64,
                    color="#0f3d2e",
                    fontWeight="bold",
                    textAlign="center",
                ),
                _text(
                    "eyebrow", "LIMITED OFFER", 56, 360, 440, 28, color="#7ad6ad", fontWeight="bold"
                ),
                _text(
                    "title",
                    "Summer Sale",
                    56,
                    400,
                    460,
                    84,
                    color="#ffffff",
                    fontWeight="bold",
                    font=_DISPLAY,
                    lineHeight=1.02,
                ),
                _text(
                    "detail",
                    "20% off every coastal tour booked this month.",
                    56,
                    520,
                    440,
                    34,
                    color="#e4f5ee",
                    opacity=0.92,
                ),
                _rect("cta_bg", 56, 940, 300, 84, "#f4a62a", radius=42),
                _text(
                    "cta",
                    "Claim deal",
                    56,
                    964,
                    300,
                    34,
                    color="#0f3d2e",
                    fontWeight="bold",
                    textAlign="center",
                ),
            ],
        ),
    ],
)

# ── Template 6: Travel Itinerary (long, pamphlet 1240×1754) ────────────────────────────────────
# A multi-scene itinerary that doubles as a **multi-page PDF** (one scene = one page) and a
# **video** (one scene = one clip). Every day page has a top photo zone the agent fills with a real
# catalog photo — that photo becomes the scene's picture in both the PDF and the MP4. The first text
# node of each scene is a one-line summary (the video caption); the scene name is the video title.
_ITIN_PHOTO_H = 760


def _day_scene(
    sid: str, name: str, day_label: str, title: str, summary: str, highlights: list[str]
) -> dict[str, Any]:
    """One itinerary day — a PDF page and a video clip. Photo zone on top, then a day badge,
    title, a one-line summary (the video caption) and a few highlight bullets."""
    nodes: list[dict[str, Any]] = [
        # Photo zone (agent drops a catalog photo here → the scene's PDF/video image).
        _rect("photo", 0, 0, 1240, _ITIN_PHOTO_H, "#1e293b", radius=0),
        # Summary first, so it is the scene's video caption.
        _text(
            "summary", summary, 100, _ITIN_PHOTO_H + 196, 1040, 34, color="#334155", lineHeight=1.3
        ),
        _rect("day_bg", 100, _ITIN_PHOTO_H + 44, 230, 66, "#38bdf8", radius=14),
        _text(
            "day",
            day_label,
            100,
            _ITIN_PHOTO_H + 62,
            230,
            30,
            color="#082f49",
            fontWeight="bold",
            textAlign="center",
        ),
        _text(
            "title",
            title,
            100,
            _ITIN_PHOTO_H + 126,
            1040,
            54,
            color="#0f172a",
            fontWeight="bold",
            font=_SERIF,
            lineHeight=1.04,
        ),
    ]
    y = _ITIN_PHOTO_H + 300
    for i, h in enumerate(highlights):
        nodes.append(_ellipse(f"hl{i}_dot", 100, y + 8, 16, 16, "#38bdf8"))
        nodes.append(_text(f"hl{i}", h, 136, y, 1000, 28, color="#475569"))
        y += 58
    # Faint placeholder hint, last so it never becomes the video caption.
    nodes.append(
        _text(
            "photo_hint",
            "Drag a photo here",
            0,
            _ITIN_PHOTO_H // 2 - 18,
            1240,
            34,
            color="#cbd5e1",
            textAlign="center",
            opacity=0.75,
        )
    )
    return _scene(sid, name, "#ffffff", nodes, duration_ms=5000, transition="fade")


_LONG_ITINERARY = _workspace(
    "Travel Itinerary",
    "pamphlet",
    1240,
    1754,
    [
        # Cover.
        _scene(
            "scene-n1",
            "Your Journey",
            "#0f172a",
            [
                _rect("photo", 0, 0, 1240, 1120, "#1e293b", radius=0),
                _text(
                    "tagline",
                    "A day-by-day guide, crafted for your trip.",
                    100,
                    1360,
                    1040,
                    36,
                    color="#cbd5e1",
                    lineHeight=1.3,
                ),
                _rect("accent", 100, 1180, 150, 10, "#38bdf8", radius=5),
                _text(
                    "eyebrow", "ITINERARY", 100, 1216, 1040, 30, color="#7dd3fc", fontWeight="bold"
                ),
                _text(
                    "title",
                    "Your Journey,\nDay by Day",
                    100,
                    1258,
                    1040,
                    92,
                    color="#ffffff",
                    fontWeight="bold",
                    font=_SERIF,
                    lineHeight=1.04,
                ),
                _text(
                    "photo_hint",
                    "Drag a cover photo here",
                    0,
                    542,
                    1240,
                    36,
                    color="#cbd5e1",
                    textAlign="center",
                    opacity=0.75,
                ),
            ],
            duration_ms=5000,
        ),
        _day_scene(
            "scene-n2",
            "Day 1 · Arrival",
            "DAY 1",
            "Arrival & First Impressions",
            "Settle in, then ease into the city with a sunset stroll along the water.",
            [
                "Hotel check-in & orientation",
                "Waterfront walk at golden hour",
                "Welcome dinner nearby",
            ],
        ),
        _day_scene(
            "scene-n3",
            "Day 2 · Icons",
            "DAY 2",
            "Icons & Landmarks",
            "The must-see sights, timed to beat the crowds and the midday heat.",
            [
                "Early start at the main landmark",
                "Guided old-town circuit",
                "Rooftop viewpoint at dusk",
            ],
        ),
        _day_scene(
            "scene-n4",
            "Day 3 · Coast",
            "DAY 3",
            "Coast & Nature",
            "Trade the city for cliffs, beaches and wide-open air.",
            ["Coastal cliff walk", "Beach time & swim stop", "Seafood lunch with a view"],
        ),
        _day_scene(
            "scene-n5",
            "Day 4 · Flavours",
            "DAY 4",
            "Food & Culture",
            "Markets, tastings and the stories behind the plates.",
            ["Morning market tour", "Hands-on tasting session", "Evening cultural show"],
        ),
        _day_scene(
            "scene-n6",
            "Day 5 · Beyond",
            "DAY 5",
            "A Day Beyond the City",
            "An easy escape just past the city limits, back by evening.",
            ["Scenic drive out", "Village & vineyard visit", "Relaxed return at sunset"],
        ),
        _day_scene(
            "scene-n7",
            "Day 6 · Farewell",
            "DAY 6",
            "One Last Highlight",
            "A final favourite before the journey home.",
            ["Leisurely late start", "Last-chance highlight", "Departure transfer"],
        ),
        # Closing.
        _scene(
            "scene-n8",
            "Safe Travels",
            "#0f172a",
            [
                _rect("accent", 100, 300, 150, 10, "#38bdf8", radius=5),
                _text(
                    "title",
                    "Safe Travels",
                    100,
                    340,
                    1040,
                    88,
                    color="#ffffff",
                    fontWeight="bold",
                    font=_SERIF,
                ),
                _text(
                    "note",
                    "We hope this trip is everything you pictured. For changes or questions, "
                    "your travel agent is one message away.",
                    100,
                    500,
                    1000,
                    36,
                    color="#cbd5e1",
                    lineHeight=1.35,
                ),
                _rect("contact_bg", 100, 720, 1040, 160, "#1e293b", radius=16),
                _text(
                    "contact",
                    "Your Agency · hello@example.com · +00 000 000 000",
                    140,
                    788,
                    960,
                    30,
                    color="#e2e8f0",
                ),
            ],
            duration_ms=5000,
        ),
    ],
)

# ════════════════════════════════════════════════════════════════════════════════════════════════
# A second, modern set of templates (AC88) — varied sizes + orientations, with current travel-design
# palettes (oceanic teals, sunset corals, earthy terracotta, cosmic night) grounded in 2026 trend
# research. Each is a single-page design with a photo zone, a type hierarchy and a CTA, authored so
# the agent drops a real catalog photo over the frame and edits the copy.
# ════════════════════════════════════════════════════════════════════════════════════════════════


def _pill(
    nid: str, label: str, x: float, y: float, w: float, h: float, bg: str, fg: str, size: float = 34
) -> list[dict[str, Any]]:
    """A rounded CTA pill: a radius-capped rect with a centred bold label."""
    return [
        _rect(f"{nid}_bg", x, y, w, h, bg, radius=h / 2),
        _text(
            nid, label, x, y + (h - size * 1.4) / 2, w, size,
            color=fg, fontWeight="bold", textAlign="center",
        ),
    ]


def _photo(
    nid: str, x: float, y: float, w: float, h: float, color: str,
    *, hint: str = "Drag a photo here", hint_color: str = "#ffffff", radius: float = 0,
) -> list[dict[str, Any]]:
    """A photo-frame placeholder with a faint centred hint the agent replaces with a photo."""
    return [
        _rect(nid, x, y, w, h, color, radius=radius),
        _text(
            f"{nid}_hint", hint, x, y + h / 2 - 18, w, 30,
            color=hint_color, textAlign="center", opacity=0.8,
        ),
    ]


# ── Aegean Minimal (portrait post, 1080×1350) ──────────────────────────────────────────────────
_AEGEAN = _workspace("Aegean Minimal", "post", 1080, 1350, [
    _scene("scene-n1", "Aegean", "#0A4D68", [
        *_photo("photo", 0, 0, 1080, 900, "#2E8BC0", hint_color="#E9F1F7"),
        # Legibility scrim fading up from the base.
        _rect("scrim", 0, 620, 1080, 280, "#0A4D68", opacity=0.55),
        _rect("accent", 80, 980, 110, 10, "#F4B860", radius=5),
        _text("eyebrow", "GREECE · CYCLADES", 80, 1012, 920, 28, color="#F4B860",
              fontWeight="bold"),
        _text("title", "Santorini", 72, 1052, 940, 120, color="#ffffff", fontWeight="bold",
              font=_SERIF, lineHeight=1.0),
        _text("subtitle", "Whitewashed cliffs, blue domes and the slow Aegean sunset.",
              80, 1192, 620, 34, color="#E9F1F7", opacity=0.92),
        *_pill("cta", "Plan the trip", 760, 1180, 240, 72, "#F4B860", "#0A4D68", size=30),
    ]),
])

# ── Sunset Coast (story, 1080×1920) ─────────────────────────────────────────────────────────────
_SUNSET = _workspace("Sunset Coast", "story", 1080, 1920, [
    _scene("scene-n1", "Sunset", "#FFF3E9", [
        # Layered warm fields suggest an atmospheric gradient.
        _rect("sky", 0, 0, 1080, 1180, "#FF6B4A"),
        _rect("glow", 0, 760, 1080, 420, "#FFB088", opacity=0.9),
        *_photo("photo", 90, 300, 900, 720, "#4A2545", hint_color="#FFE9DD", radius=28),
        _text("eyebrow", "SUMMER ESCAPES", 90, 1240, 900, 30, color="#4A2545", fontWeight="bold"),
        _text("title", "Chase the\nGolden Hour", 84, 1290, 940, 104, color="#4A2545",
              fontWeight="bold", font=_DISPLAY, lineHeight=1.02),
        _text("subtitle", "Seven coastal evenings you’ll never want to end.",
              90, 1560, 820, 38, color="#6B3A52", opacity=0.95),
        *_pill("cta", "Book now", 90, 1680, 340, 96, "#FF6B4A", "#FFF3E9"),
    ]),
])

# ── Alpine Clean (presentation, 1920×1080 landscape) ────────────────────────────────────────────
_ALPINE = _workspace("Alpine Clean", "wide", 1920, 1080, [
    _scene("scene-n1", "Alpine", "#F4F6F3", [
        _rect("panel", 0, 0, 864, 1080, "#1F3A34"),
        _rect("accent", 96, 300, 120, 10, "#E07A4B", radius=5),
        _text("eyebrow", "THE ALPS", 96, 336, 680, 30, color="#8FB39B", fontWeight="bold"),
        _text("title", "Breathe\nAbove the\nClouds", 88, 384, 720, 108, color="#F4F6F3",
              fontWeight="bold", font=_SERIF, lineHeight=1.02),
        _text("subtitle", "Guided summits, alpine lodges and quiet mornings.",
              96, 760, 640, 34, color="#C9C6BE"),
        *_pill("cta", "See the routes", 96, 860, 320, 84, "#E07A4B", "#F4F6F3", size=30),
        *_photo("photo", 864, 0, 1056, 1080, "#8FB39B", hint_color="#1F3A34"),
    ]),
])

# ── Tropical Pop (square social, 1080×1080) ─────────────────────────────────────────────────────
_TROPICAL = _workspace("Tropical Pop", "social", 1080, 1080, [
    _scene("scene-n1", "Tropical", "#FFF8EC", [
        _rect("block", 0, 0, 1080, 1080, "#0F8A5F"),
        _ellipse("sun", 760, -120, 460, 460, "#B6E388", opacity=0.55),
        *_photo("photo", 90, 150, 900, 640, "#0B6B49", hint_color="#E9FBE9", radius=36),
        _ellipse("dot", 120, 120, 70, 70, "#F03E5A"),
        _text("title", "Hello, Paradise", 90, 820, 900, 78, color="#FFF8EC", fontWeight="bold",
              font=_DISPLAY),
        _text("subtitle", "Reef dives, street food and island time.", 90, 918, 600, 34,
              color="#B6E388"),
        *_pill("cta", "Explore", 740, 900, 250, 80, "#F03E5A", "#FFF8EC"),
    ]),
])

# ── Desert Luxe (portrait post, 1080×1350) ──────────────────────────────────────────────────────
_DESERT = _workspace("Desert Luxe", "post", 1080, 1350, [
    _scene("scene-n1", "Desert", "#F2E7D5", [
        *_photo("photo", 140, 150, 800, 760, "#B5643C", hint_color="#F2E7D5", radius=6),
        _rect("rule_top", 140, 100, 800, 4, "#8C4A2F"),
        _text("eyebrow", "MOROCCO", 140, 960, 800, 26, color="#8C4A2F", fontWeight="bold",
              textAlign="center"),
        _text("title", "Marrakech", 140, 1000, 800, 96, color="#2B211A", font=_SERIF,
              textAlign="center"),
        _text("subtitle", "Souks, riads and the Sahara at dusk — a four-night escape.",
              170, 1130, 740, 32, color="#8C4A2F", textAlign="center"),
        *_pill("cta", "Request itinerary", 330, 1230, 420, 76, "#B5643C", "#F2E7D5", size=30),
    ]),
])

# ── City Grid (portrait post, 1080×1350) ────────────────────────────────────────────────────────
_CITYGRID = _workspace("City Grid", "post", 1080, 1350, [
    _scene("scene-n1", "City", "#E4E4E1", [
        *_photo("photo", 60, 60, 620, 620, "#22252A", hint_color="#E4E4E1", radius=10),
        _rect("stat_bg", 700, 60, 320, 300, "#FFD23F", radius=10),
        _text("stat_num", "48h", 700, 120, 320, 110, color="#22252A", fontWeight="bold",
              font=_DISPLAY, textAlign="center"),
        _text("stat_label", "the perfect city break", 700, 250, 320, 28, color="#22252A",
              textAlign="center"),
        _rect("teal_bg", 700, 380, 320, 300, "#1E8E8A", radius=10),
        _text("teal_text", "Eat · See · Repeat", 700, 500, 320, 32, color="#ffffff",
              fontWeight="bold", textAlign="center"),
        _text("title", "Lisbon in a\nWeekend", 60, 720, 960, 96, color="#22252A", fontWeight="bold",
              font=_DISPLAY, lineHeight=1.02),
        _text("subtitle", "Trams, miradouros and pastéis — a 48-hour plan.", 60, 940, 820, 32,
              color="#44474C"),
        *_pill("cta", "Get the guide", 60, 1040, 360, 84, "#22252A", "#FFD23F", size=30),
    ]),
])

# ── Festival Night (square social, 1080×1080) ───────────────────────────────────────────────────
_FESTIVAL = _workspace("Festival Night", "social", 1080, 1080, [
    _scene("scene-n1", "Festival", "#140B2E", [
        _rect("field", 0, 0, 1080, 1080, "#5B2A86", opacity=0.35),
        _ellipse("s1", 160, 150, 14, 14, "#FFF4CC"),
        _ellipse("s2", 900, 120, 10, 10, "#30D0E0"),
        _ellipse("s3", 760, 300, 12, 12, "#FFF4CC"),
        _ellipse("s4", 250, 760, 10, 10, "#E84393"),
        _text("eyebrow", "LIVE · THIS SUMMER", 90, 180, 900, 30, color="#30D0E0",
              fontWeight="bold", textAlign="center"),
        _text("title", "Neon Nights\nFestival", 90, 360, 900, 110, color="#ffffff",
              fontWeight="bold", font=_DISPLAY, textAlign="center", lineHeight=1.02),
        _text("meta", "Aug 14–16 · Harbour Park", 90, 660, 900, 36, color="#FFF4CC",
              textAlign="center"),
        *_pill("cta", "Get tickets", 360, 780, 360, 92, "#E84393", "#ffffff"),
    ]),
])

# ── Heritage Trail (A4 flyer, 1480×2096 portrait) ───────────────────────────────────────────────
_HERITAGE = _workspace("Heritage Trail", "flyer", 1480, 2096, [
    _scene("scene-n1", "Heritage", "#F3EAD8", [
        _rect("rule_top", 150, 150, 1180, 6, "#2E4034"),
        _text("eyebrow", "WALKING TOURS", 150, 190, 1180, 34, color="#A8432B", fontWeight="bold"),
        _text("title", "The Heritage\nTrail", 140, 250, 1200, 150, color="#2E4034", font=_SERIF,
              fontWeight="bold", lineHeight=1.02),
        *_photo("photo", 150, 600, 1180, 760, "#2E4034", hint_color="#F3EAD8", radius=8),
        _text("stop1", "1 — Old Town Gate", 150, 1420, 1180, 40, color="#241F18",
              fontWeight="bold"),
        _text("stop1b", "Begin at the medieval gate and climb to the ramparts.", 150, 1470, 1180,
              30, color="#4A4034"),
        _text("stop2", "2 — Cathedral Square", 150, 1540, 1180, 40, color="#241F18",
              fontWeight="bold"),
        _text("stop2b", "Markets, mosaics and the bell tower view.", 150, 1590, 1180, 30,
              color="#4A4034"),
        _text("stop3", "3 — Riverside Mill", 150, 1660, 1180, 40, color="#241F18",
              fontWeight="bold"),
        _text("stop3b", "Finish with tea where the old mill still turns.", 150, 1710, 1180, 30,
              color="#4A4034"),
        _rect("cta_band", 150, 1840, 1180, 120, "#2E4034", radius=12),
        _text("cta", "Book a guided walk · heritagetrail.example", 150, 1882, 1180, 36,
              color="#F3EAD8", fontWeight="bold", textAlign="center"),
    ]),
])

# ── Slow Travel (portrait post, 1080×1350) ──────────────────────────────────────────────────────
_SLOW = _workspace("Slow Travel", "post", 1080, 1350, [
    _scene("scene-n1", "Slow", "#F6F5F1", [
        _text("eyebrow", "SLOW TRAVEL", 90, 150, 900, 26, color="#9BAE9B", fontWeight="bold",
              textAlign="center"),
        _rect("rule", 480, 210, 120, 3, "#D9D2C7"),
        *_photo("photo", 240, 280, 600, 600, "#D9D2C7", hint_color="#33434F", radius=300),
        _text("title", "Take it slow", 90, 930, 900, 84, color="#33434F", font=_SERIF,
              textAlign="center"),
        _text("subtitle", "Unhurried days, long lunches and the scenic road.", 150, 1050, 780, 32,
              color="#6B7680", textAlign="center"),
        *_pill("cta", "Start planning", 360, 1160, 360, 76, "#D98E5A", "#ffffff", size=30),
    ]),
])

# ── Welcome Banner (wide banner, 1200×628) ──────────────────────────────────────────────────────
_BANNER = _workspace("Welcome Banner", "banner", 1200, 628, [
    _scene("scene-n1", "Banner", "#0E6B5E", [
        *_photo("photo", 620, 0, 580, 628, "#14716A", hint_color="#D1FAF4"),
        _rect("scrim", 0, 0, 760, 628, "#0E6B5E", opacity=0.85),
        _rect("accent", 70, 180, 100, 8, "#F3C96B", radius=4),
        _text("eyebrow", "VISIT IRELAND", 70, 206, 600, 26, color="#F3C96B", fontWeight="bold"),
        _text("title", "The Wild\nAtlantic Way", 64, 244, 620, 76, color="#ffffff",
              fontWeight="bold", font=_DISPLAY, lineHeight=1.02),
        *_pill("cta", "Explore the route", 70, 440, 320, 72, "#F3C96B", "#0E6B5E", size=28),
    ]),
])

# ── Trip Card (business card, 1050×600 landscape) ───────────────────────────────────────────────
_CARD = _workspace("Trip Card", "card", 1050, 600, [
    _scene("scene-n1", "Card", "#ffffff", [
        _rect("band", 0, 0, 360, 600, "#1F3A5F"),
        _ellipse("logo", 120, 110, 120, 120, "#E06A63"),
        _text("logo_mark", "R", 120, 138, 120, 64, color="#ffffff", fontWeight="bold",
              font=_DISPLAY, textAlign="center"),
        _text("brand", "Rivera Travel", 120, 300, 180, 30, color="#ffffff", fontWeight="bold",
              textAlign="center"),
        _text("name", "Alex Rivera", 430, 150, 560, 56, color="#1F3A5F", fontWeight="bold",
              font=_SERIF),
        _text("role", "Independent Travel Designer", 430, 230, 560, 30, color="#E06A63"),
        _rect("rule", 430, 300, 420, 3, "#E6E6E6"),
        _text("contact", "alex@riveratravel.example\n+353 1 555 0101\nriveratravel.example",
              430, 330, 560, 30, color="#44474C", lineHeight=1.5),
    ]),
])

# ── Island Breeze (story, 1080×1920) ────────────────────────────────────────────────────────────
_ISLAND = _workspace("Island Breeze", "story", 1080, 1920, [
    _scene("scene-n1", "Island", "#0FA3A3", [
        _rect("aqua", 0, 0, 1080, 1180, "#6FD6D6", opacity=0.55),
        *_photo("photo", 90, 240, 900, 820, "#0A3D3D", hint_color="#EAFBFA", radius=32),
        # Soft wave shapes at the base.
        _ellipse("wave1", -160, 1500, 900, 520, "#EAFBFA", opacity=0.5),
        _ellipse("wave2", 360, 1600, 1000, 560, "#6FD6D6", opacity=0.6),
        _text("eyebrow", "ISLAND HOPPING", 90, 1200, 900, 30, color="#063A3A", fontWeight="bold"),
        _text("title", "Catch the\nBreeze", 84, 1250, 940, 108, color="#063A3A", fontWeight="bold",
              font=_DISPLAY, lineHeight=1.02),
        _text("subtitle", "Five islands, turquoise water, zero rush.", 90, 1520, 820, 36,
              color="#0A3D3D", opacity=0.9),
        *_pill("cta", "See packages", 90, 1650, 380, 96, "#FF7F6B", "#ffffff"),
    ]),
])


# id -> full workspace. Metadata for the Templates list is derived from this.
TEMPLATE_WORKSPACES: dict[str, dict[str, Any]] = {
    # Modern set (AC88) first — these are what the gallery leads with.
    "aegean-minimal": _AEGEAN,
    "sunset-coast": _SUNSET,
    "alpine-clean": _ALPINE,
    "tropical-pop": _TROPICAL,
    "desert-luxe": _DESERT,
    "city-grid": _CITYGRID,
    "festival-night": _FESTIVAL,
    "heritage-trail": _HERITAGE,
    "slow-travel": _SLOW,
    "welcome-banner": _BANNER,
    "trip-card": _CARD,
    "island-breeze": _ISLAND,
    # Original set.
    "destination-poster": _POSTER,
    "trip-itinerary": _ITINERARY,
    "weekend-getaway": _PROMO,
    "event-announcement": _EVENT,
    "special-offer": _OFFER,
    "travel-itinerary": _LONG_ITINERARY,
}

# Human-facing descriptions for the Templates gallery.
TEMPLATE_DESCRIPTIONS: dict[str, str] = {
    "aegean-minimal": "Portrait post: a cinematic photo, a serif place name and a sunset accent.",
    "sunset-coast": "Story with a warm sunset gradient, a rounded photo and a stacked headline.",
    "alpine-clean": "16:9 presentation: a calm title panel beside a full-bleed mountain photo.",
    "tropical-pop": "Square post: playful colour blocks, a rounded photo inset and a punchy title.",
    "desert-luxe": "Editorial post: a framed inset photo, a serif title and a request CTA.",
    "city-grid": "Portrait post on a modular grid — hero photo, a stat tile and a city-break CTA.",
    "festival-night": "Square event card: a cosmic field, twinkling stars, date/venue and tickets.",
    "heritage-trail": "A4 flyer: a serif title, a photo and a numbered walking-tour stop list.",
    "slow-travel": "Airy portrait post: a circular photo, a light serif headline and white space.",
    "welcome-banner": "Wide web/cover banner: a hero photo with an eyebrow, headline and CTA.",
    "trip-card": "Landscape business card: a brand band with monogram, name, role and contacts.",
    "island-breeze": "Story with a teal gradient, soft wave shapes, a rounded photo and a CTA.",
    "destination-poster": "A bold portrait poster: hero photo, headline and a call-to-action.",
    "trip-itinerary": "A printable two-page itinerary: cover + a day-by-day plan with photo spots.",
    "weekend-getaway": "A square social promo: hero photo, headline and a booking call-to-action.",
    "event-announcement": "A story-format event invite: photo, date-time chip, venue and tickets.",
    "special-offer": "A square deal card: discount badge, offer headline and a claim button.",
    "travel-itinerary": (
        "A long day-by-day travel itinerary (8 pages): cover, six day pages with photo "
        "spots, and a closing page — export as a multi-page PDF or a narrated video."
    ),
}

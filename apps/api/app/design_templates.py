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

# id -> full workspace. Metadata for the Templates list is derived from this.
TEMPLATE_WORKSPACES: dict[str, dict[str, Any]] = {
    "destination-poster": _POSTER,
    "trip-itinerary": _ITINERARY,
    "weekend-getaway": _PROMO,
    "event-announcement": _EVENT,
    "special-offer": _OFFER,
    "travel-itinerary": _LONG_ITINERARY,
}

# Human-facing descriptions for the Templates gallery.
TEMPLATE_DESCRIPTIONS: dict[str, str] = {
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

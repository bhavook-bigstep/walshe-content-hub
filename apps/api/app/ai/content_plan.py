"""Content planner: turn a vague brief into a concrete, scene-by-scene build brief (markdown).

The plan is ART DIRECTION the user can edit, then run as the AI Builder's prompt (plan → build). It
is deliberately TEMPLATE-ALIGNED: every scene names a real builder template and keeps to what the
builder can execute (a palette, a headline + short support, ONE real photographic image) rather than
bespoke maps/sprites/diagrams that produce off-template, messy scenes. It is grounded in the
approved item titles and must not invent facts (Contract 1 in spirit; grounding is enforced when the
Builder applies ops). Deterministic stub (no key) so tests/dev are hermetic (Contract 4). The
image/LLM key comes from env only, never logged (Contract 2).
"""

from __future__ import annotations

import logging

from app.ai.base import AIProvider
from app.ai.studio_agent import AgentItem
from app.observability.tracing import traced

logger = logging.getLogger("app.ai.content_plan")


def _catalog(items: list[AgentItem]) -> str:
    if not items:
        return "(no approved items — plan with copy, palette and real photographic imagery only)"
    return "\n".join(
        f"- {it.id}: {it.title}" + (f" — {it.destination}" if it.destination else "")
        for it in items
    )


def _template_archetypes() -> str:
    """A compact list of the builder's real templates, so the plan maps each scene onto one the
    builder can actually execute — instead of inventing bespoke maps/sprites/diagrams it can't
    build (the root cause of off-template, messy scenes)."""
    try:
        from app.design_templates import TEMPLATE_DESCRIPTIONS, TEMPLATE_WORKSPACES
    except Exception:  # noqa: BLE001 — the catalog is guidance; never fail planning over it
        return "(template list unavailable — plan clean hero / title / feature / CTA scenes)"
    lines: list[str] = []
    for tid, ws in TEMPLATE_WORKSPACES.items():
        name = (ws.get("metadata") or {}).get("name") or tid
        desc = (TEMPLATE_DESCRIPTIONS.get(tid) or "").strip()
        pages = len(ws.get("scenes") or [])
        # Flag page count so the planner names a specific PAGE for a multi-page template (single
        # page needs none) — else the builder can't tell which page of a reel/itinerary to copy.
        tag = f" [{pages} pages — name the page to use, 1..{pages}]" if pages > 1 else ""
        lines.append(f"- {name}{tag}: {desc}")
    return "\n".join(lines)


def plan_prompt(brief: str, items: list[AgentItem]) -> str:
    return (
        "You are an ART DIRECTOR for a premium travel brand, writing a build brief for a design "
        "agent. The agent builds each scene by starting from ONE of the TEMPLATES below and "
        "adapting it — so your plan MUST map cleanly onto these templates. Do NOT invent bespoke "
        "illustrations, treasure maps, charts, diagrams, numbered route markers or multi-step "
        "sprite choreography — the builder cannot build those well, and they wreck the design.\n\n"
        "TEMPLATES the builder starts from (choose the best fit per scene, BY NAME):\n"
        f"{_template_archetypes()}\n\n"
        "ART DIRECTION — make it premium and cohesive:\n"
        "- Pick ONE palette/mood for the whole reel (name it) and keep every scene in it.\n"
        "- One clear focal point per scene: a single strong headline + at most one short support "
        "line. Generous spacing — never crowd or stack copy on copy.\n"
        "- IMAGERY = REAL PHOTOGRAPHY only: an approved item's photo, or a photographic backdrop "
        "of a real place/subject. NEVER request illustrations, maps, charts, logos, icons, or any "
        "image with TEXT/words/numbers IN it — image models render in-image text as garbled "
        "nonsense. If no photo fits, say 'none — type-led'.\n"
        "- Keep motion implicit: the builder adds tasteful entrances itself. Do NOT choreograph "
        "sprites, routes or markers.\n\n"
        "For EACH scene give, briefly (the builder COPIES the named template, then applies your "
        "ADAPT changes — so name a REAL template and be concrete):\n"
        "- TEMPLATE: the exact best-fit template name from the list above. If it is marked "
        "'[N pages]', you MUST also name the page to use for THIS scene, e.g. 'Travel Itinerary, "
        "page 3'; a single-page template needs no page.\n"
        "- ADAPT: the specific changes to make that template fit this scene — which text becomes "
        "what, which photo slot gets which image, the palette/mood, any element to add or drop.\n"
        "- ROLE: what the scene does (hero/open, feature, itinerary step, CTA…).\n"
        "- HEADLINE + SUPPORT: the exact copy, grounded ONLY in the approved items — never invent "
        "facts, stats or prices.\n"
        "- IMAGE: an approved item to place, or a one-line real-photography direction (subject + "
        "mood), or 'none — type-led'.\n\n"
        f"APPROVED ITEMS:\n{_catalog(items)}\n\n"
        f"BRIEF: {brief.strip()}\n\n"
        "Return clean markdown: first '**Palette/Mood:** …' then '**Concept:** …', then a section "
        "per scene (## Scene 1, ## Scene 2, …) with those bullets. Keep the whole plan to 3–5 "
        "scenes."
    )


def _stub_plan(brief: str, items: list[AgentItem]) -> str:
    """Deterministic, template-aligned plan (no key) — a hero scene plus one feature per item."""
    b = brief.strip()
    lines = [
        "**Palette/Mood:** Coastal Calm — deep teal, warm sand accent; airy and premium.",
        f"**Concept:** {b[:160] or 'A short, premium travel reel.'}",
        "",
        "## Scene 1 — Hero",
        "- TEMPLATE: Destination Poster",
        "- ADAPT: set the headline to the brief's title, fill the hero photo slot, theme to the "
        "palette above",
        "- ROLE: open the reel",
        "- HEADLINE + SUPPORT: a bold welcoming title drawn from the brief; one short support line",
        "- IMAGE: a real photographic backdrop of the destination (no text in the image)",
    ]
    for n, it in enumerate(items[:3], start=2):
        where = f" in {it.destination}" if it.destination else ""
        lines += [
            "",
            f"## Scene {n} — {it.title}",
            "- TEMPLATE: Weekend Getaway",
            f"- ADAPT: headline to '{it.title}', fill the hero photo slot with its photo, keep the "
            "palette",
            "- ROLE: feature",
            f"- HEADLINE + SUPPORT: a short, grounded line about {it.title}",
            f"- IMAGE: the approved photo of {it.title}{where}",
        ]
    return "\n".join(lines)


@traced("content-plan", "chain")
def generate_content_plan(provider: AIProvider, brief: str, items: list[AgentItem]) -> str:
    """Generate the scene-by-scene markdown plan for ``brief``, grounded in ``items``.

    Falls back to the deterministic stub plan on the stub provider, an empty response, or any
    provider error — so the planner always returns something usable.
    """
    if provider.name == "stub":
        return _stub_plan(brief, items)
    try:
        text = provider.complete(plan_prompt(brief, items), max_tokens=1400).text.strip()
    except Exception:  # noqa: BLE001 — any provider error degrades to the deterministic plan
        logger.info("content-plan provider call failed; using the deterministic plan")
        return _stub_plan(brief, items)
    return text or _stub_plan(brief, items)

"""Content planner: turn a vague brief into a concrete, scene-by-scene content plan (markdown).

The plan is a rich brief — background, copy, which approved item to place, animation,
duration, per scene — that the user can edit and then run as the AI Builder's prompt (plan → build).
It is grounded in the approved item titles and must not invent facts (Contract 1 in spirit; the real
grounding is enforced when the Builder applies ops). Deterministic stub (no key) so tests/dev are
hermetic (Contract 4). The image/LLM key comes from env only, never logged (Contract 2).
"""

from __future__ import annotations

import logging

from app.ai.base import AIProvider
from app.ai.studio_agent import AgentItem

logger = logging.getLogger("app.ai.content_plan")


def _catalog(items: list[AgentItem]) -> str:
    if not items:
        return "(no approved items — plan with copy, colour and shapes only)"
    return "\n".join(
        f"- {it.id}: {it.title}" + (f" — {it.destination}" if it.destination else "")
        for it in items
    )


def plan_prompt(brief: str, items: list[AgentItem]) -> str:
    return (
        "You are a creative director for a travel brand. Turn the brief into a concrete, "
        "scene-by-scene content plan for a short social reel/post.\n"
        "For EACH scene specify, briefly: the background (a colour or mood), the exact "
        "headline + any caption copy (grounded ONLY in the approved items — never invent facts, "
        "stats or prices), which approved item image to place and roughly where, any decorative "
        "shapes or animated sprites, the entrance + emphasis animation, and the scene "
        "duration.\n"
        "Use ONLY the approved items (reference them by name). Keep it tight and practical — "
        "this plan will be executed verbatim by a builder agent.\n\n"
        f"APPROVED ITEMS:\n{_catalog(items)}\n\n"
        f"BRIEF: {brief.strip()}\n\n"
        "Return clean markdown: a one-line overall concept, then a section per scene "
        "(## Scene 1, ## Scene 2, …) with short bullet points."
    )


def _stub_plan(brief: str, items: list[AgentItem]) -> str:
    """Deterministic templated plan (no key) — one scene per approved item, plus an intro."""
    lines = [
        f"**Concept:** {brief.strip()[:160] or 'A short, vibrant travel reel.'}",
        "",
        "## Scene 1 — Opening",
        "- Background: deep teal (#0e2a26)",
        "- Headline: a bold, welcoming title drawn from the brief",
        "- Animation: headline fades in; subtle emphasis float",
        "- Duration: 4s",
    ]
    for n, it in enumerate(items[:4], start=2):
        where = f" in {it.destination}" if it.destination else ""
        lines += [
            "",
            f"## Scene {n} — {it.title}",
            f"- Place the image of **{it.title}**{where}, filling the lower half",
            f"- Caption: a short, grounded line about {it.title}",
            "- Animation: image rises in; caption slides from the left",
            "- Duration: 4s",
        ]
    return "\n".join(lines)


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

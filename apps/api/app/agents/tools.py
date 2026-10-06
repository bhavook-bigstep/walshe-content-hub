"""Grounded, permission-scoped tools the assistant (AC38) and discovery endpoints (AC39/AC40) call.

Each tool resolves content *only* through ``app.services.visibility`` so an agent can never reach
unapproved, expired, off-limits or out-of-scope items — not via search, suggestions, or the chatbot.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.base import AIProvider
from app.lifecycle import display_status
from app.models.catalog import CatalogEntry
from app.models.composition import Composition
from app.models.user import User
from app.services import retrieval, visibility

# Type hints pulled out of a plain-language query (singular + common plural) to narrow a search.
_TYPE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("event", re.compile(r"\bevents?\b")),
    ("place", re.compile(r"\bplaces?\b")),
    ("opportunity", re.compile(r"\bopportunit(y|ies)\b")),
    ("offer", re.compile(r"\boffers?\b")),
    ("itinerary", re.compile(r"\bitinerar(y|ies)\b")),
)
# Filler words dropped from a keyword query so "find me something in …" still matches on the nouns.
_STOP = frozenset(
    {
        "find",
        "show",
        "me",
        "the",
        "a",
        "an",
        "in",
        "on",
        "for",
        "of",
        "to",
        "please",
        "get",
        "want",
        "something",
        "with",
        "us",
        "near",
        "about",
        "any",
    }
)


@dataclass(frozen=True)
class ItemCard:
    """The minimal, safe projection of an entry the assistant/discovery returns."""

    id: int
    title: str
    type: str
    destination: str
    display_status: str
    reason: str = ""

    @classmethod
    def of(cls, entry: CatalogEntry, now: datetime, *, reason: str = "") -> "ItemCard":
        return cls(
            id=entry.id,
            title=entry.title,
            type=entry.type.value,
            destination=entry.destination,
            display_status=display_status(entry.status, entry.expires_at, now).value,
            reason=reason,
        )


def search_catalog(
    db: Session,
    agent: User,
    query: str,
    *,
    now: datetime,
    limit: int = 8,
    provider: AIProvider | None = None,
) -> list[CatalogEntry]:
    """Plain-language catalog search (AC39/AC44). Resolve the *visible* set first (the choke-point
    covers approved/current/in-scope/off-limits), narrow by a type/destination hint (or keyword
    tokens), then **hybrid-rank** the result (vector + keyword) when a provider is given."""
    low = (query or "").strip().lower()
    visible = visibility.entries_for_actor(db, agent, now=now)

    type_ = next((val for val, rx in _TYPE_PATTERNS if rx.search(low)), None)
    destination = next((e.destination for e in visible if e.destination.lower() in low), None)

    rows = visible
    if destination is not None:
        rows = [r for r in rows if r.destination == destination]
    if type_ is not None:
        rows = [r for r in rows if r.type.value == type_]
    # No structured hint → match the remaining meaningful tokens against the item's own text.
    if destination is None and type_ is None and low:
        tokens = [w for w in re.findall(r"[a-z0-9]+", low) if len(w) > 2 and w not in _STOP]
        if tokens:
            rows = [
                r
                for r in rows
                if any(
                    tok in f"{r.title} {r.description} {r.destination}".lower() for tok in tokens
                )
            ]
    if provider is not None and low and rows:
        return retrieval.rank_entries(db, query, rows, provider, limit=limit)
    return rows[:limit]


def used_item_ids(db: Session, agent: User) -> set[int]:
    """Catalog ids the agent has already pulled into a saved composition/project."""
    used: set[int] = set()
    comps = db.execute(select(Composition.item_ids).where(Composition.agent_id == agent.id)).all()
    for (ids,) in comps:
        used.update(ids or [])
    return used


def suggest_items(
    db: Session, agent: User, *, now: datetime, limit: int = 5
) -> list[tuple[CatalogEntry, str]]:
    """Suggested next posts (AC40): current, visible items the agent hasn't used yet, timely first.

    No blank screen — an agent always gets something worth sending. Expiring-soon items are offered
    first (share them while they're live), then the rest, newest first.
    """
    used = used_item_ids(db, agent)
    # Compute each candidate's display status once, then rank: expiring-soon first, then newest.
    # Expired items are shown greyed in the catalog but are NOT usable (AC55), so never suggested.
    scored = [
        (e, display_status(e.status, e.expires_at, now).value == "expiring_soon")
        for e in visibility.entries_for_actor(db, agent, now=now)
        if e.id not in used
        and display_status(e.status, e.expires_at, now).value != "expired"
    ]
    scored.sort(key=lambda pair: (0 if pair[1] else 1, -pair[0].id))

    out: list[tuple[CatalogEntry, str]] = []
    for entry, soon in scored[:limit]:
        reason = (
            "Expiring soon — share it while it's live." if soon else "You haven't used this yet."
        )
        out.append((entry, reason))
    return out

"""Catalog visibility — the single choke-point for Contract 1 / AC6.

Every agent-facing read goes through ``agent_visible_entries`` (or ``is_visible_to_agent`` for a
single entry). An agent may only ever see entries that are **approved**, **brand-safe**, and within
their **access scope**. No router issues an ad-hoc agent query.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import lifecycle
from app.models.blocklist import BlocklistTerm
from app.models.catalog import Asset, CatalogEntry, CatalogType, EntryStatus
from app.models.user import Role, User


def active_blocked_terms(db: Session) -> frozenset[str]:
    """All off-limits terms (lower-cased), loaded once per request (AC36)."""
    return frozenset(db.execute(select(BlocklistTerm.term)).scalars().all())


def _entry_text(entry: CatalogEntry) -> str:
    """All searchable text on an entry, lower-cased — including the structured fields (AC29) so an
    off-limits subject cannot hide in a highlight, attribute or custom section (AC36)."""
    parts = [
        entry.title,
        entry.destination,
        entry.description,
        *entry.market_tags,
        *entry.highlights,
    ]
    for section in entry.custom_sections or []:
        parts.append(str(section.get("title", "")))
        parts.append(str(section.get("body", "")))
    parts.extend(str(v) for v in (entry.attributes or {}).values())
    return " ".join(parts).lower()


def is_blocked(entry: CatalogEntry, blocked_terms: frozenset[str]) -> bool:
    """True iff an off-limits term appears anywhere in the entry's text (AC36 / FR-08).

    Substring, case-insensitive — a term flags a *subject* wherever it surfaces, structured fields
    included, so it cannot reach an agent through the Builder or a custom section.
    """
    if not blocked_terms:
        return False
    haystack = _entry_text(entry)
    return any(term in haystack for term in blocked_terms)


def _legacy_entry_gate(entry: CatalogEntry, agent: User) -> bool:
    """The pre-AC49 per-entry gate: approved + brand-safe + in access scope. Applied only to a
    catalog-less entry (migration bridge) until it is moved into a catalog."""
    if entry.status != EntryStatus.approved or not entry.brand_safe:
        return False
    tenants = entry.allowed_tenant_ids or []
    agents = entry.allowed_agent_ids or []
    if not tenants and not agents:
        return True
    if agent.tenant_id is not None and agent.tenant_id in tenants:
        return True
    return agent.id in agents


def is_visible_to_agent(
    entry: CatalogEntry, agent: User, *, now: datetime, blocked_terms: frozenset[str]
) -> bool:
    """True iff ``agent`` may use ``entry`` — the single Contract-1 gate (AC6, re-based to AC49).

    Catalog-gating (AC49): an entry in a catalog is usable iff that catalog is public, or private
    and shared with the agent. Expiry (AC32/33) and the off-limits list (AC36) always still apply.
    A catalog-less entry falls back to the legacy approved + brand-safe + scope gate so pre-AC49
    data stays correct until migrated.

    ``now`` and ``blocked_terms`` are both required (no default) so an un-updated agent-facing
    caller fails loudly rather than silently skipping expiry or the off-limits list.
    """
    if lifecycle.is_expired(entry.expires_at, now):
        return False
    if is_blocked(entry, blocked_terms):
        return False
    catalog = entry.catalog
    if catalog is not None:
        return catalog.is_accessible_to_agent(agent.id)
    return _legacy_entry_gate(entry, agent)


def agent_visible_entries(
    db: Session,
    agent: User,
    *,
    now: datetime,
    destination: str | None = None,
    type_: CatalogType | None = None,
    q: str | None = None,
) -> list[CatalogEntry]:
    """Return the entries an agent may see, narrowed by optional destination/type/text filters.

    No status/brand-safe SQL pre-filter: visibility is decided per row by ``is_visible_to_agent``
    (catalog-gating, with the legacy fallback for catalog-less entries)."""
    stmt = select(CatalogEntry)
    if destination:
        stmt = stmt.where(CatalogEntry.destination == destination)
    if type_ is not None:
        stmt = stmt.where(CatalogEntry.type == type_)

    rows = db.execute(stmt.order_by(CatalogEntry.id)).scalars().all()

    blocked = active_blocked_terms(db)
    needle = (q or "").strip().lower()
    result: list[CatalogEntry] = []
    for entry in rows:
        if not is_visible_to_agent(entry, agent, now=now, blocked_terms=blocked):
            continue  # access-scope filter (JSON membership) done in Python for portability
        if needle and needle not in entry.title.lower() and needle not in entry.description.lower():
            continue
        result.append(entry)
    return result


def agent_visible_entries_by_ids(
    db: Session, agent: User, ids: list[int], *, now: datetime
) -> list[CatalogEntry]:
    """Resolve ``ids`` in request order (de-duped), dropping unknown or hidden entries.

    Visibility is decided solely by ``is_visible_to_agent`` — no additional access rule.
    """
    blocked = active_blocked_terms(db)
    result: list[CatalogEntry] = []
    seen: set[int] = set()
    for entry_id in ids:
        if entry_id in seen:
            continue
        seen.add(entry_id)
        entry = db.get(CatalogEntry, entry_id)
        if entry is not None and is_visible_to_agent(entry, agent, now=now, blocked_terms=blocked):
            result.append(entry)
    return result


def visible_asset_or_none(
    db: Session, user: User, object_key: str, *, now: datetime
) -> Asset | None:
    """Return the Asset for ``object_key`` iff ``user`` may read it, else None (Contract 1/2).

    Unknown keys, hidden entries and traversal attempts are all indistinguishable (None).
    """
    if ".." in object_key or object_key.startswith("/") or "\\" in object_key:
        return None  # reject traversal before any lookup or storage access
    asset = db.execute(select(Asset).where(Asset.object_key == object_key)).scalars().first()
    if asset is None:
        return None
    entry = db.get(CatalogEntry, asset.entry_id)
    if entry is None:
        return None
    if user.role == Role.super_admin:
        return asset
    if user.role == Role.content_provider:
        return asset if entry.provider_id == user.id else None
    if user.role == Role.tourism_agent:
        blocked = active_blocked_terms(db)
        return asset if is_visible_to_agent(entry, user, now=now, blocked_terms=blocked) else None
    return None

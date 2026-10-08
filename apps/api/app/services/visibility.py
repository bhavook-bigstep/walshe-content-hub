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
from app.models.catalog import (
    Asset,
    Catalog,
    CatalogEntry,
    CatalogType,
    EntryStatus,
    EntryVisibility,
    Item,
    Season,
    UserAsset,
)
from app.models.user import Role, Tenant, User


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
    entry: CatalogEntry,
    agent: User,
    *,
    now: datetime,
    blocked_terms: frozenset[str],
    allow_expired: bool = False,
) -> bool:
    """True iff ``agent`` may see ``entry`` — the single Contract-1 gate (AC6, re-based to AC54).

    Per-entry gating (AC54): an entry in a catalog is visible iff it is **public**, or **private**
    and the agent is invited on its catalog (``shared_agent_ids``); **draft** entries reach no
    agent. The off-limits list (AC36) always applies. A catalog-less entry falls back to the legacy
    approved + brand-safe + scope gate so pre-catalog data stays correct.

    Expiry (AC32/33/AC55): by default an expired entry is excluded (it is not *usable* — the
    build/schedule paths pass ``allow_expired=False``). Browse/read paths pass
    ``allow_expired=True`` so an expired entry is still *shown* (greyed), while remaining unusable.

    ``now`` and ``blocked_terms`` are both required (no default) so an un-updated agent-facing
    caller fails loudly rather than silently skipping expiry or the off-limits list.
    """
    if not allow_expired and lifecycle.is_expired(entry.expires_at, now):
        return False
    if is_blocked(entry, blocked_terms):
        return False
    catalog = entry.catalog
    if catalog is not None:
        if entry.visibility == EntryVisibility.public:
            return True
        if entry.visibility == EntryVisibility.private:
            return agent.id in (catalog.shared_agent_ids or [])
        return False  # draft — not distributed to any agent
    return _legacy_entry_gate(entry, agent)


def agent_visible_entries(
    db: Session,
    agent: User,
    *,
    now: datetime,
    destination: str | None = None,
    country: str | None = None,
    state: str | None = None,
    city: str | None = None,
    season: Season | None = None,
    type_: CatalogType | None = None,
    q: str | None = None,
    tags: list[str] | None = None,
    org: str | None = None,
) -> list[CatalogEntry]:
    """Return the entries an agent may see, narrowed by optional location/season/type/text filters.

    Free-text ``q`` matches the entry's **full searchable text** (``_entry_text``: title,
    destination, description, market tags, highlights, custom sections and structured attribute
    values) — not just title/description — so a search for a tag, city or attribute finds the
    entry (AC7). ``tags`` keeps entries carrying **any** of the given market tags (OR, so adding a
    tag broadens like a facet); ``org`` keeps entries from one provider organisation (exact,
    case-insensitive). No status/brand-safe SQL pre-filter: visibility is decided per row by
    ``is_visible_to_agent`` (catalog-gating, with the legacy fallback for catalog-less entries)."""
    stmt = select(CatalogEntry)
    if destination:
        stmt = stmt.where(CatalogEntry.destination == destination)
    if country:
        stmt = stmt.where(CatalogEntry.country == country)
    if state:
        stmt = stmt.where(CatalogEntry.state == state)
    if city:
        stmt = stmt.where(CatalogEntry.city == city)
    if season is not None:
        stmt = stmt.where(CatalogEntry.season == season)
    if type_ is not None:
        stmt = stmt.where(CatalogEntry.type == type_)

    rows = db.execute(stmt.order_by(CatalogEntry.id)).scalars().all()

    blocked = active_blocked_terms(db)
    needle = (q or "").strip().lower()
    want_tags = {t.strip().lower() for t in (tags or []) if t.strip()}
    want_org = (org or "").strip().lower()
    result: list[CatalogEntry] = []
    for entry in rows:
        # Browse shows expired entries greyed (AC55), so allow_expired here; the build/schedule
        # paths (agent_visible_entries_by_ids) keep the default to drop them from use.
        if not is_visible_to_agent(
            entry, agent, now=now, blocked_terms=blocked, allow_expired=True
        ):
            continue  # access-scope filter (JSON membership) done in Python for portability
        if needle and needle not in _entry_text(entry):
            continue
        if want_tags and not ({t.lower() for t in entry.market_tags} & want_tags):
            continue
        if want_org and (entry.org_name or "").strip().lower() != want_org:
            continue
        result.append(entry)
    return result


def catalog_has_visible_entry(catalog: Catalog, agent: User) -> bool:
    """Whether ``agent`` can see any entry in ``catalog`` (AC54) — a public entry, or a private one
    when the agent is invited. Expiry/off-limits aren't applied here (catalog-level listing); they
    still filter the entries themselves when browsed."""
    invited = agent.id in (catalog.shared_agent_ids or [])
    for entry in catalog.entries:
        if entry.visibility == EntryVisibility.public:
            return True
        if entry.visibility == EntryVisibility.private and invited:
            return True
    return False


def entries_for_actor(db: Session, user: User, *, now: datetime) -> list[CatalogEntry]:
    """Entries an actor may browse via the assistant (AC57): a content provider sees their **own**
    full catalog (every set), an agent sees their visible set (catalog-gated, expired greyed)."""
    if user.role == Role.content_provider:
        return (
            db.execute(
                select(CatalogEntry)
                .where(CatalogEntry.provider_id == user.id)
                .order_by(CatalogEntry.id)
            )
            .scalars()
            .all()
        )
    return agent_visible_entries(db, user, now=now)


def visible_catalogs_for_agent(db: Session, agent: User) -> list[Catalog]:
    """Catalogs an agent may browse (AC54) — those holding at least one entry visible to the agent
    (a public entry, or a private one they're invited to). Kept in this one choke-point so routers
    don't issue ad-hoc catalog queries."""
    rows = db.execute(select(Catalog).order_by(Catalog.id)).scalars().all()
    return [c for c in rows if catalog_has_visible_entry(c, agent)]


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


def _entry_readable(db: Session, entry: CatalogEntry | None, user: User, *, now: datetime) -> bool:
    """Whether ``user`` may read media belonging to ``entry`` (provider owner, admin, or an agent
    the entry is visible to)."""
    if entry is None:
        return False
    if user.role == Role.super_admin:
        return True
    if user.role == Role.content_provider:
        return entry.provider_id == user.id
    if user.role == Role.tourism_agent:
        # Media of an expired (greyed) entry still renders in the catalog, so allow_expired.
        return is_visible_to_agent(
            entry, user, now=now, blocked_terms=active_blocked_terms(db), allow_expired=True
        )
    return False


def can_read_object(db: Session, user: User, object_key: str, *, now: datetime) -> bool:
    """Single gate for serving a stored object (AC4/AC50/AC51) across the three media stores —
    catalog Assets + entry Items (gated by their entry/catalog) and personal UserAssets
    (owner-only). Unknown keys and traversal attempts return False (indistinguishable from hidden).
    """
    if ".." in object_key or object_key.startswith("/") or "\\" in object_key:
        return False
    asset = db.execute(select(Asset).where(Asset.object_key == object_key)).scalars().first()
    if asset is not None:
        return _entry_readable(db, db.get(CatalogEntry, asset.entry_id), user, now=now)
    item = db.execute(select(Item).where(Item.object_key == object_key)).scalars().first()
    if item is not None:
        return _entry_readable(db, db.get(CatalogEntry, item.entry_id), user, now=now)
    cover = (
        db.execute(select(CatalogEntry).where(CatalogEntry.cover_object_key == object_key))
        .scalars()
        .first()
    )
    if cover is not None:
        return _entry_readable(db, cover, user, now=now)
    mine = db.execute(select(UserAsset).where(UserAsset.object_key == object_key)).scalars().first()
    if mine is not None:
        return mine.owner_id == user.id
    # An agent's brand logo (users/<id>/brand-logo/<uuid>) — owner-only, stored without a UserAsset
    # row — is readable by its owner (used by the brand-kit preview + the studio's Apply brand kit).
    parts = object_key.split("/")
    if len(parts) >= 3 and parts[0] == "users" and parts[2] in {"brand-logo", "sprites"}:
        # Brand logos and imported sprite frames (users/<id>/sprites/…) are owner-only.
        return parts[1] == str(user.id)
    # Org logos (AC58) are not sensitive: any authenticated user may read one that an org points at.
    if object_key.startswith("tenants/") and "/logo/" in object_key:
        return (
            db.execute(select(Tenant.id).where(Tenant.logo_url == f"/assets/{object_key}")).first()
            is not None
        )
    return False


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

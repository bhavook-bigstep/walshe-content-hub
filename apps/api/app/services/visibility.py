"""Catalog visibility — the single choke-point for Contract 1 / AC6.

Every agent-facing read goes through ``agent_visible_entries`` (or ``is_visible_to_agent`` for a
single entry). An agent may only ever see entries that are **approved**, **brand-safe**, and within
their **access scope**. No router issues an ad-hoc agent query.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.user import User


def is_visible_to_agent(entry: CatalogEntry, agent: User) -> bool:
    """True iff ``entry`` is approved, brand-safe, and in ``agent``'s access scope."""
    if entry.status != EntryStatus.approved or not entry.brand_safe:
        return False
    tenants = entry.allowed_tenant_ids or []
    agents = entry.allowed_agent_ids or []
    if not tenants and not agents:
        return True  # open to all approved + brand-safe viewers
    if agent.tenant_id is not None and agent.tenant_id in tenants:
        return True
    return agent.id in agents


def agent_visible_entries(
    db: Session,
    agent: User,
    *,
    destination: str | None = None,
    type_: CatalogType | None = None,
    q: str | None = None,
) -> list[CatalogEntry]:
    """Return the entries an agent may see, narrowed by optional destination/type/text filters."""
    stmt = select(CatalogEntry).where(
        CatalogEntry.status == EntryStatus.approved,
        CatalogEntry.brand_safe.is_(True),
    )
    if destination:
        stmt = stmt.where(CatalogEntry.destination == destination)
    if type_ is not None:
        stmt = stmt.where(CatalogEntry.type == type_)

    rows = db.execute(stmt.order_by(CatalogEntry.id)).scalars().all()

    needle = (q or "").strip().lower()
    result: list[CatalogEntry] = []
    for entry in rows:
        if not is_visible_to_agent(entry, agent):
            continue  # access-scope filter (JSON membership) done in Python for portability
        if needle and needle not in entry.title.lower() and needle not in entry.description.lower():
            continue
        result.append(entry)
    return result

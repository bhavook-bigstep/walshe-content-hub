"""Catalog library routes (AC49).

A provider owns many catalogs; each is public (usable by every agent) or private (usable only by
the agents it is shared with). This catalog-level gate is the Contract-1 distribution control,
re-based from per-entry approval (AC6 → AC49). Agent-facing reads of catalog *content* still go
through ``services/visibility`` — these routes only manage catalogs and list the accessible ones.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import clock
from app.deps import get_db, require_role
from app.models.catalog import Catalog, CatalogVisibility
from app.models.user import Role, User
from app.schemas.catalog import (
    AgentInvite,
    AgentRef,
    CatalogCreate,
    CatalogOut,
    CatalogShareUpdate,
    CatalogUpdate,
    EntryOut,
)
from app.services.visibility import (
    active_blocked_terms,
    catalog_has_visible_entry,
    is_visible_to_agent,
    visible_catalogs_for_agent,
)

router = APIRouter(prefix="/catalogs", tags=["catalogs"])

_provider_only = require_role(Role.content_provider)
_agent_only = require_role(Role.tourism_agent)


def provider_catalog(db: Session, provider: User) -> Catalog:
    """The provider's single catalog (AC49) — one per provider; created on first access."""
    cat = (
        db.execute(
            select(Catalog).where(Catalog.provider_id == provider.id).order_by(Catalog.id)
        )
        .scalars()
        .first()
    )
    if cat is None:
        cat = Catalog(
            provider_id=provider.id,
            name=f"{provider.display_name or 'My'} catalog",
            category="",
            visibility=CatalogVisibility.private,
            shared_agent_ids=[],
        )
        db.add(cat)
        db.commit()
        db.refresh(cat)
    return cat


def _own_catalog(db: Session, catalog_id: int, provider: User) -> Catalog:
    catalog = db.get(Catalog, catalog_id)
    if catalog is None or catalog.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catalog not found")
    return catalog


def _invited_agents(db: Session, catalog: Catalog) -> list[AgentRef]:
    """Resolve the catalog's invited agent ids to id + email for display (AC54)."""
    ids = catalog.shared_agent_ids or []
    if not ids:
        return []
    rows = db.execute(select(User).where(User.id.in_(ids))).scalars().all()
    return [AgentRef(id=u.id, email=u.email, display_name=u.display_name or "") for u in rows]


def _my_catalog_out(db: Session, catalog: Catalog) -> CatalogOut:
    return CatalogOut.from_catalog(catalog, invited_agents=_invited_agents(db, catalog))


@router.get("/mine", response_model=CatalogOut)
def get_my_catalog(
    provider: User = Depends(_provider_only), db: Session = Depends(get_db)
) -> CatalogOut:
    """The provider's single catalog (AC49), created on first access."""
    return _my_catalog_out(db, provider_catalog(db, provider))


@router.post("/mine/invite", response_model=CatalogOut)
def invite_agent(
    body: AgentInvite,
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
) -> CatalogOut:
    """Invite a tourism agent (by email) to this catalog's private entries (AC54)."""
    email = body.email.strip().lower()
    agent = db.execute(
        select(User).where(func.lower(User.email) == email)
    ).scalars().first()
    if agent is None or agent.role != Role.tourism_agent:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "No tourism agent found with that email address"
        )
    catalog = provider_catalog(db, provider)
    catalog.shared_agent_ids = sorted({*(catalog.shared_agent_ids or []), agent.id})
    db.commit()
    db.refresh(catalog)
    return _my_catalog_out(db, catalog)


@router.delete("/mine/invite/{agent_id}", response_model=CatalogOut)
def uninvite_agent(
    agent_id: int,
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
) -> CatalogOut:
    """Remove an invited agent from this catalog (AC54)."""
    catalog = provider_catalog(db, provider)
    catalog.shared_agent_ids = [a for a in (catalog.shared_agent_ids or []) if a != agent_id]
    db.commit()
    db.refresh(catalog)
    return _my_catalog_out(db, catalog)


@router.patch("/mine", response_model=CatalogOut)
def update_my_catalog(
    body: CatalogUpdate, provider: User = Depends(_provider_only), db: Session = Depends(get_db)
) -> CatalogOut:
    catalog = provider_catalog(db, provider)
    if body.name is not None:
        catalog.name = body.name
    if body.category is not None:
        catalog.category = body.category
    if body.visibility is not None:
        catalog.visibility = body.visibility
    db.commit()
    db.refresh(catalog)
    return _my_catalog_out(db, catalog)


@router.put("/mine/share", response_model=CatalogOut)
def share_my_catalog(
    body: CatalogShareUpdate,
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
) -> CatalogOut:
    catalog = provider_catalog(db, provider)
    valid = set(db.execute(select(User.id).where(User.role == Role.tourism_agent)).scalars().all())
    catalog.shared_agent_ids = sorted({a for a in body.shared_agent_ids if a in valid})
    db.commit()
    db.refresh(catalog)
    return _my_catalog_out(db, catalog)


@router.get("/mine/entries", response_model=list[EntryOut])
def list_my_entries(
    ai_created: bool | None = Query(default=None),
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> list[EntryOut]:
    """Entries in the provider's catalog (AC50) — all of them, regardless of agent-visibility.

    ``ai_created`` filters the set (AC68): ``true`` = only Auto-Catalog-generated entries,
    ``false`` = only hand-authored entries, omitted = all."""
    catalog = provider_catalog(db, provider)
    entries = catalog.entries
    if ai_created is not None:
        entries = [e for e in entries if bool(e.ai_created) == ai_created]
    return [EntryOut.from_entry(e, now=now) for e in entries]


@router.post("", response_model=CatalogOut, status_code=status.HTTP_201_CREATED)
def create_catalog(
    body: CatalogCreate, provider: User = Depends(_provider_only), db: Session = Depends(get_db)
) -> CatalogOut:
    catalog = Catalog(
        provider_id=provider.id,
        name=body.name,
        category=body.category,
        visibility=body.visibility,
        shared_agent_ids=[],
    )
    db.add(catalog)
    db.commit()
    db.refresh(catalog)
    return CatalogOut.from_catalog(catalog)


@router.get("", response_model=list[CatalogOut])
def list_own_catalogs(
    provider: User = Depends(_provider_only), db: Session = Depends(get_db)
) -> list[CatalogOut]:
    rows = (
        db.execute(select(Catalog).where(Catalog.provider_id == provider.id).order_by(Catalog.id))
        .scalars()
        .all()
    )
    return [CatalogOut.from_catalog(c) for c in rows]


@router.patch("/{catalog_id}", response_model=CatalogOut)
def update_catalog(
    catalog_id: int,
    body: CatalogUpdate,
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
) -> CatalogOut:
    catalog = _own_catalog(db, catalog_id, provider)
    if body.name is not None:
        catalog.name = body.name
    if body.category is not None:
        catalog.category = body.category
    if body.visibility is not None:
        catalog.visibility = body.visibility
    db.commit()
    db.refresh(catalog)
    return CatalogOut.from_catalog(catalog)


@router.put("/{catalog_id}/share", response_model=CatalogOut)
def share_catalog(
    catalog_id: int,
    body: CatalogShareUpdate,
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
) -> CatalogOut:
    """Set the agents a private catalog is shared with (AC49). Only real tourism agents are kept."""
    catalog = _own_catalog(db, catalog_id, provider)
    valid_agent_ids = set(
        db.execute(select(User.id).where(User.role == Role.tourism_agent)).scalars().all()
    )
    catalog.shared_agent_ids = sorted({a for a in body.shared_agent_ids if a in valid_agent_ids})
    db.commit()
    db.refresh(catalog)
    return CatalogOut.from_catalog(catalog)


@router.delete("/{catalog_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catalog(
    catalog_id: int, provider: User = Depends(_provider_only), db: Session = Depends(get_db)
) -> None:
    catalog = _own_catalog(db, catalog_id, provider)
    if catalog.entries:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Catalog is not empty; move or delete its entries first"
        )
    db.delete(catalog)
    db.commit()


@router.get("/accessible", response_model=list[CatalogOut])
def list_accessible_catalogs(
    agent: User = Depends(_agent_only), db: Session = Depends(get_db)
) -> list[CatalogOut]:
    """Catalogs an agent may browse: every public one + the private ones shared with them (AC49).
    The single catalog-level gate — entry/item reads then flow through services/visibility."""
    return [CatalogOut.from_catalog(c) for c in visible_catalogs_for_agent(db, agent)]


@router.get("/{catalog_id}/entries", response_model=list[EntryOut])
def list_catalog_entries(
    catalog_id: int,
    user: User = Depends(require_role(Role.content_provider, Role.tourism_agent)),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> list[EntryOut]:
    """Browse a catalog's entries + their items (AC50/AC54). A provider sees their own catalog's
    entries (every set); an agent sees only the entries visible to them (public, or private when
    invited), with expiry/off-limits applied via the visibility choke-point. A catalog with nothing
    visible to the agent looks like missing (404), so its existence can't be probed."""
    catalog = db.get(Catalog, catalog_id)
    if catalog is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catalog not found")
    if user.role == Role.content_provider:
        if catalog.provider_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Catalog not found")
        return [EntryOut.from_entry(e, now=now) for e in catalog.entries]
    # agent
    if not catalog_has_visible_entry(catalog, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catalog not found")
    blocked = active_blocked_terms(db)
    return [
        EntryOut.from_entry(e, now=now)
        for e in catalog.entries
        if is_visible_to_agent(e, user, now=now, blocked_terms=blocked, allow_expired=True)
    ]

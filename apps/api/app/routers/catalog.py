"""Catalog routes.

Provider side (AC3/AC5): create entries, set brand-safe + access scope, delete (audited, C3).
Agent side (AC6/AC7): list/search — **only** via ``agent_visible_entries`` (Contract 1 choke-point).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import audit
from app.deps import get_db, require_role
from app.models.catalog import CatalogEntry, CatalogType
from app.models.user import Role, User
from app.schemas.catalog import AccessUpdate, EntryCreate, EntryOut
from app.services.visibility import agent_visible_entries, is_visible_to_agent

router = APIRouter(prefix="/catalog", tags=["catalog"])

_provider_only = require_role(Role.content_provider)
_agent_only = require_role(Role.tourism_agent)


@router.post("", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(
    body: EntryCreate,
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
) -> CatalogEntry:
    entry = CatalogEntry(
        type=body.type,
        title=body.title,
        description=body.description,
        destination=body.destination,
        market_tags=body.market_tags,
        provider_id=provider.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/{entry_id}", response_model=EntryOut)
def set_access(
    entry_id: int,
    body: AccessUpdate,
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
) -> CatalogEntry:
    entry = db.get(CatalogEntry, entry_id)
    if entry is None or entry.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    if body.brand_safe is not None:
        entry.brand_safe = body.brand_safe
    if body.status is not None:
        entry.status = body.status
    if body.allowed_tenant_ids is not None:
        entry.allowed_tenant_ids = body.allowed_tenant_ids
    if body.allowed_agent_ids is not None:
        entry.allowed_agent_ids = body.allowed_agent_ids
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
) -> None:
    entry = db.get(CatalogEntry, entry_id)
    if entry is None or entry.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    audit.record(
        db, actor_id=provider.id, action="delete", target_type="catalog_entry", target_id=entry_id
    )
    db.delete(entry)
    db.commit()


@router.get("", response_model=list[EntryOut])
def list_for_agent(
    destination: str | None = Query(default=None),
    type: CatalogType | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
) -> list[CatalogEntry]:
    return agent_visible_entries(db, agent, destination=destination, type_=type, q=q)


@router.get("/{entry_id}", response_model=EntryOut)
def get_for_agent(
    entry_id: int,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
) -> CatalogEntry:
    entry = db.get(CatalogEntry, entry_id)
    if entry is None or not is_visible_to_agent(entry, agent):
        # Unapproved/unsafe/out-of-scope entries are indistinguishable from missing (Contract 1).
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return entry

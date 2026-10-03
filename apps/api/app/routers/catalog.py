"""Catalog routes.

Provider side (AC3/AC5): create entries, set brand-safe + access scope, delete (audited, C3).
Agent side (AC6/AC7): list/search — **only** via ``agent_visible_entries`` (Contract 1 choke-point).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import audit, clock
from app.content_templates import CONTENT_TEMPLATES
from app.deps import get_db, require_role
from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.user import Role, User
from app.schemas.catalog import (
    AccessUpdate,
    ContentTemplates,
    EntryContentUpdate,
    EntryCreate,
    EntryOut,
)
from app.services.visibility import agent_visible_entries, is_visible_to_agent

router = APIRouter(prefix="/catalog", tags=["catalog"])

_provider_only = require_role(Role.content_provider)
_agent_only = require_role(Role.tourism_agent)


@router.get("/templates", response_model=ContentTemplates)
def content_templates() -> ContentTemplates:
    """Self-describing schema of the structured fields per content type (AC29)."""
    return ContentTemplates(templates=CONTENT_TEMPLATES)


@router.post("", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(
    body: EntryCreate,
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
    now: datetime = Depends(clock.now),
) -> EntryOut:
    # A pending (unapproved) provider has no workspace access until verified (AC25).
    if not provider.approved:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your organization is pending verification")
    entry = CatalogEntry(
        type=body.type,
        title=body.title,
        description=body.description,
        destination=body.destination,
        market_tags=body.market_tags,
        attributes=body.attributes,
        highlights=body.highlights,
        custom_sections=[s.model_dump() for s in body.custom_sections],
        valid_from=body.valid_from,
        expires_at=body.expires_at,
        provider_id=provider.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return EntryOut.from_entry(entry, now=now)


@router.put("/{entry_id}", response_model=EntryOut)
def update_content(
    entry_id: int,
    body: EntryContentUpdate,
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
    now: datetime = Depends(clock.now),
) -> EntryOut:
    """Edit an entry's structured content (AC29). Provider owns the entry; access/status stay on
    the PATCH endpoint. Any content change bumps ``content_version`` so copies flag (AC33)."""
    entry = db.get(CatalogEntry, entry_id)
    if entry is None or entry.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    data = body.model_dump(exclude_unset=True)
    changed = False
    for field in ("title", "description", "destination", "market_tags", "attributes", "highlights"):
        if field in data and data[field] is not None:
            setattr(entry, field, data[field])
            changed = True
    if "custom_sections" in data and data["custom_sections"] is not None:
        entry.custom_sections = [dict(s) for s in data["custom_sections"]]
        changed = True
    if changed:
        entry.content_version += 1  # AC33: editing a master item flags every in-use copy
    db.commit()
    db.refresh(entry)
    return EntryOut.from_entry(entry, now=now)


@router.patch("/{entry_id}", response_model=EntryOut)
def set_access(
    entry_id: int,
    body: AccessUpdate,
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
    now: datetime = Depends(clock.now),
) -> EntryOut:
    entry = db.get(CatalogEntry, entry_id)
    if entry is None or entry.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    was_approved = entry.status == EntryStatus.approved
    fields = body.model_dump(exclude_unset=True)
    if body.brand_safe is not None:
        entry.brand_safe = body.brand_safe
    if body.status is not None:
        entry.status = body.status
    if body.allowed_tenant_ids is not None:
        entry.allowed_tenant_ids = body.allowed_tenant_ids
    if body.allowed_agent_ids is not None:
        entry.allowed_agent_ids = body.allowed_agent_ids
    if "valid_from" in fields:
        entry.valid_from = body.valid_from
    if "expires_at" in fields:
        entry.expires_at = body.expires_at
    # Contract 3: unpublish and access/brand-safety overwrites are traceable.
    if body.status is not None and was_approved and body.status != EntryStatus.approved:
        audit.record(
            db,
            actor_id=provider.id,
            action="unpublish",
            target_type="catalog_entry",
            target_id=entry_id,
        )
    if (
        body.brand_safe is not None
        or body.allowed_tenant_ids is not None
        or body.allowed_agent_ids is not None
    ):
        audit.record(
            db,
            actor_id=provider.id,
            action="overwrite",
            target_type="catalog_entry",
            target_id=entry_id,
        )
    db.commit()
    db.refresh(entry)
    return EntryOut.from_entry(entry, now=now)


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
    now: datetime = Depends(clock.now),
) -> list[EntryOut]:
    rows = agent_visible_entries(db, agent, now=now, destination=destination, type_=type, q=q)
    return [EntryOut.from_entry(e, now=now) for e in rows]


@router.get("/{entry_id}", response_model=EntryOut)
def get_for_agent(
    entry_id: int,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> EntryOut:
    entry = db.get(CatalogEntry, entry_id)
    if entry is None or not is_visible_to_agent(entry, agent, now=now):
        # Unapproved/unsafe/out-of-scope/expired entries are indistinguishable from missing (C1).
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return EntryOut.from_entry(entry, now=now)

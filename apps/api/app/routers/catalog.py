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
from app.geo import GEO, SEASONS
from app.models.catalog import (
    Catalog,
    CatalogEntry,
    CatalogType,
    EntryStatus,
    EntryVisibility,
    Item,
    ItemKind,
    Season,
)
from app.models.user import Role, User
from app.schemas.catalog import (
    AccessUpdate,
    ContentTemplates,
    EntryContentUpdate,
    EntryCreate,
    EntryOut,
    GeoCountry,
    GeoData,
    GeoState,
    ItemOut,
    SeasonOption,
    SendBackRequest,
    TextItemCreate,
)
from app.services.visibility import (
    active_blocked_terms,
    agent_visible_entries,
    is_visible_to_agent,
)

router = APIRouter(prefix="/catalog", tags=["catalog"])

_provider_only = require_role(Role.content_provider)
_agent_only = require_role(Role.tourism_agent)
_reviewer = require_role(Role.content_provider, Role.super_admin)


@router.get("/templates", response_model=ContentTemplates)
def content_templates() -> ContentTemplates:
    """Self-describing schema of the structured fields per content type (AC29)."""
    return ContentTemplates(templates=CONTENT_TEMPLATES)


@router.get("/geo", response_model=GeoData)
def geo_reference() -> GeoData:
    """Curated country → state → city hierarchy + the fixed season list (AC53) that powers the
    New-entry location dropdowns and the agent catalog's location/season filters."""
    countries = [
        GeoCountry(
            name=country,
            states=[GeoState(name=state, cities=cities) for state, cities in states.items()],
        )
        for country, states in GEO.items()
    ]
    return GeoData(countries=countries, seasons=[SeasonOption(**s) for s in SEASONS])


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
    # AC49: an entry belongs to the provider's catalog when a catalog_id is given (the New-Entry UI
    # passes the provider's single catalog); it must be one of the provider's own catalogs. A
    # catalog-less entry (no catalog_id) stays on the legacy approved+brand-safe gate.
    if body.catalog_id is not None:
        catalog_row = db.get(Catalog, body.catalog_id)
        if catalog_row is None or catalog_row.provider_id != provider.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Catalog not found")
    entry = CatalogEntry(
        catalog_id=body.catalog_id,
        type=body.type,
        title=body.title,
        description=body.description,
        destination=body.destination,
        country=body.country,
        state=body.state,
        city=body.city,
        season=body.season,
        visibility=body.visibility,
        market_tags=body.market_tags,
        attributes=body.attributes,
        highlights=body.highlights,
        custom_sections=[s.model_dump() for s in body.custom_sections],
        valid_from=body.valid_from,
        expires_at=body.expires_at,
        provider_id=provider.id,
        # Provenance (AC56): snapshot the creator + their org at creation.
        created_by_email=provider.email,
        org_name=(provider.tenant.name if provider.tenant else ""),
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
    for field in (
        "type", "title", "description", "destination", "country", "state", "city", "season",
        "market_tags", "attributes", "highlights",
    ):
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
    was_distributed = entry.visibility in (EntryVisibility.public, EntryVisibility.private)
    fields = body.model_dump(exclude_unset=True)
    if body.brand_safe is not None:
        entry.brand_safe = body.brand_safe
    if body.visibility is not None:
        entry.visibility = body.visibility
    if body.status is not None:
        entry.status = body.status
        # Resubmitting (back into review) or re-approving clears the send-back reason (AC35).
        if body.status in (EntryStatus.in_review, EntryStatus.approved):
            entry.review_reason = ""
    if body.allowed_tenant_ids is not None:
        entry.allowed_tenant_ids = body.allowed_tenant_ids
    if body.allowed_agent_ids is not None:
        entry.allowed_agent_ids = body.allowed_agent_ids
    if "valid_from" in fields:
        entry.valid_from = body.valid_from
    if "expires_at" in fields:
        entry.expires_at = body.expires_at
    # Contract 3: unpublish and access/brand-safety overwrites are traceable. Pulling an entry out
    # of a distributed set (public/private → draft) is an unpublish (AC54).
    pulled = (
        body.visibility is not None
        and was_distributed
        and body.visibility == EntryVisibility.draft
    )
    if (body.status is not None and was_approved and body.status != EntryStatus.approved) or pulled:
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


@router.post("/{entry_id}/send-back", response_model=EntryOut)
def send_back(
    entry_id: int,
    body: SendBackRequest,
    db: Session = Depends(get_db),
    reviewer: User = Depends(_reviewer),
    now: datetime = Depends(clock.now),
) -> EntryOut:
    """Return an entry to its owner with a reason (AC35 / FR-14).

    A provider may send back only their own entry; a super admin may send back any. The entry drops
    to ``draft`` with the reason recorded (shown to the owner) and re-enters review on resubmit.
    """
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A reason is required")
    entry = db.get(CatalogEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    if reviewer.role == Role.content_provider and entry.provider_id != reviewer.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    entry.status = EntryStatus.draft
    entry.review_reason = reason
    audit.record(
        db,
        actor_id=reviewer.id,
        action="send_back",
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
    country: str | None = Query(default=None),
    state: str | None = Query(default=None),
    city: str | None = Query(default=None),
    season: Season | None = Query(default=None),
    type: CatalogType | None = Query(default=None),
    q: str | None = Query(default=None),
    tags: list[str] | None = Query(default=None),
    org: str | None = Query(default=None),
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> list[EntryOut]:
    rows = agent_visible_entries(
        db, agent, now=now, destination=destination, country=country, state=state,
        city=city, season=season, type_=type, q=q, tags=tags, org=org,
    )
    return [EntryOut.from_entry(e, now=now) for e in rows]


@router.get("/{entry_id}", response_model=EntryOut)
def get_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.content_provider, Role.tourism_agent)),
    now: datetime = Depends(clock.now),
) -> EntryOut:
    """Fetch one entry (with its items). The owning provider sees their own; an agent sees it only
    if visible to them (Contract 1). A hidden/unknown entry looks like missing (C1/AC36)."""
    entry = db.get(CatalogEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    if user.role == Role.content_provider:
        if entry.provider_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    else:
        blocked = active_blocked_terms(db)
        # Agents can open an expired (greyed) entry for context (AC55); usage is gated elsewhere.
        if not is_visible_to_agent(
            entry, user, now=now, blocked_terms=blocked, allow_expired=True
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return EntryOut.from_entry(entry, now=now)


# ---- Entry items (AC50): first-class text/media pieces of an entry ----


def _owned_entry(db: Session, entry_id: int, provider: User) -> CatalogEntry:
    entry = db.get(CatalogEntry, entry_id)
    if entry is None or entry.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return entry


@router.post("/{entry_id}/items/text", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def add_text_item(
    entry_id: int,
    body: TextItemCreate,
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
) -> ItemOut:
    entry = _owned_entry(db, entry_id, provider)
    item = Item(
        entry_id=entry.id, kind=ItemKind.text, order=body.order, title=body.title, text=body.text
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ItemOut.model_validate(item)


@router.get("/{entry_id}/items", response_model=list[ItemOut])
def list_items(
    entry_id: int,
    user: User = Depends(require_role(Role.content_provider, Role.tourism_agent)),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> list[ItemOut]:
    entry = db.get(CatalogEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    if user.role == Role.content_provider:
        if entry.provider_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    elif not is_visible_to_agent(
        entry, user, now=now, blocked_terms=active_blocked_terms(db), allow_expired=True
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return [ItemOut.model_validate(i) for i in entry.items]


@router.delete("/{entry_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    entry_id: int,
    item_id: int,
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
) -> None:
    entry = _owned_entry(db, entry_id, provider)
    item = db.get(Item, item_id)
    if item is None or item.entry_id != entry.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    db.delete(item)
    db.commit()

"""Catalog library routes (AC49).

A provider owns many catalogs; each is public (usable by every agent) or private (usable only by
the agents it is shared with). This catalog-level gate is the Contract-1 distribution control,
re-based from per-entry approval (AC6 → AC49). Agent-facing reads of catalog *content* still go
through ``services/visibility`` — these routes only manage catalogs and list the accessible ones.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.catalog import Catalog
from app.models.user import Role, User
from app.schemas.catalog import CatalogCreate, CatalogOut, CatalogShareUpdate, CatalogUpdate

router = APIRouter(prefix="/catalogs", tags=["catalogs"])

_provider_only = require_role(Role.content_provider)
_agent_only = require_role(Role.tourism_agent)


def _own_catalog(db: Session, catalog_id: int, provider: User) -> Catalog:
    catalog = db.get(Catalog, catalog_id)
    if catalog is None or catalog.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catalog not found")
    return catalog


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
    rows = db.execute(select(Catalog).order_by(Catalog.id)).scalars().all()
    accessible = [c for c in rows if c.is_accessible_to_agent(agent.id)]
    return [CatalogOut.from_catalog(c) for c in accessible]

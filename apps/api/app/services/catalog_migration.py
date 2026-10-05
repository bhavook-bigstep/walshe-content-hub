"""Migrate pre-AC49 catalog-less entries into per-provider catalogs.

Deterministic + idempotent (Contract 4): each catalog-less entry is placed in one of its provider's
migration catalogs — a **public** "Imported" catalog for entries that were approved + brand-safe
(so they stay visible to agents under catalog-gating), a **private** "Drafts" catalog for the rest
(so unapproved content stays hidden). Running it again moves nothing.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import Catalog, CatalogEntry, CatalogVisibility, EntryStatus


def migrate_entries_to_catalogs(db: Session) -> int:
    """Assign every catalog-less entry to a provider catalog. Returns the number moved."""
    rows = (
        db.execute(select(CatalogEntry).where(CatalogEntry.catalog_id.is_(None)).order_by(CatalogEntry.id))
        .scalars()
        .all()
    )
    cache: dict[tuple[int, CatalogVisibility], Catalog] = {}
    moved = 0
    for entry in rows:
        public = entry.status == EntryStatus.approved and entry.brand_safe
        visibility = CatalogVisibility.public if public else CatalogVisibility.private
        name = "Imported" if public else "Drafts"
        key = (entry.provider_id, visibility)
        catalog = cache.get(key)
        if catalog is None:
            catalog = (
                db.execute(
                    select(Catalog).where(
                        Catalog.provider_id == entry.provider_id, Catalog.name == name
                    )
                )
                .scalars()
                .first()
            )
            if catalog is None:
                catalog = Catalog(
                    provider_id=entry.provider_id,
                    name=name,
                    category="Imported",
                    visibility=visibility,
                    shared_agent_ids=[],
                )
                db.add(catalog)
                db.flush()
            cache[key] = catalog
        entry.catalog_id = catalog.id
        moved += 1
    db.commit()
    return moved

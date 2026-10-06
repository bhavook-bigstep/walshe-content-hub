"""Migrate pre-AC49 catalog-less entries into per-provider catalogs.

Deterministic + idempotent (Contract 4): each catalog-less entry is placed in one of its provider's
migration catalogs — a **public** "Imported" catalog for entries that were approved + brand-safe
(so they stay visible to agents under catalog-gating), a **private** "Drafts" catalog for the rest
(so unapproved content stays hidden). Running it again moves nothing.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import (
    Catalog,
    CatalogEntry,
    CatalogVisibility,
    EntryStatus,
    EntryVisibility,
    Item,
    ItemKind,
)


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
        # AC54: carry the legacy approved+brand-safe gate over to per-entry visibility, so a
        # migrated entry keeps the same reach (public if it was distributable, else draft).
        entry.visibility = EntryVisibility.public if public else EntryVisibility.draft
        moved += 1
    db.commit()
    return moved


def decompose_entries_to_items(db: Session) -> int:
    """Turn each entry's text (title/description/custom sections) + assets into first-class items
    (AC50). Idempotent: an entry that already has items is skipped. Returns entries decomposed."""
    entries = db.execute(select(CatalogEntry).order_by(CatalogEntry.id)).scalars().all()
    done = 0
    for entry in entries:
        if entry.items:
            continue
        new: list[Item] = []
        texts: list[tuple[str, str]] = []
        if entry.title:
            texts.append(("Title", entry.title))
        if entry.description:
            texts.append(("Description", entry.description))
        for section in entry.custom_sections or []:
            body = str(section.get("body", "")).strip()
            if body:
                texts.append((str(section.get("title", "")), body))
        for title, body in texts:
            new.append(
                Item(entry_id=entry.id, kind=ItemKind.text, order=len(new), title=title, text=body)
            )
        for asset in entry.assets:
            is_video = asset.content_type.lower().startswith("video/")
            new.append(
                Item(
                    entry_id=entry.id,
                    kind=ItemKind.video if is_video else ItemKind.image,
                    order=len(new),
                    object_key=asset.object_key,
                    content_type=asset.content_type,
                )
            )
        if new:
            db.add_all(new)
            done += 1
    db.commit()
    return done

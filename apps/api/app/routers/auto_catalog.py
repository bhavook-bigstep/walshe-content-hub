"""Auto-Catalog agent routes (AC64–AC70) — provider-only.

A provider uploads a document (PDF / PNG / JPEG); the AI seam (AC16) extracts tourism info and an
agent turns it into **1..N draft catalog entries** in the provider's own catalog. Every generated
entry is a **draft** (``EntryVisibility.draft``, ``status=draft``, ``brand_safe=False``) carrying
the **AI-created** marker (AC68) — invisible to agents (Contract 1) until the provider reviews,
edits and publishes it via the existing editor + AC54 controls (AC69). Deterministic with the stub;
logs counts only, never document text or keys (Contracts 2 & 5).
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import clock
from app.ai.extract import SUPPORTED_CONTENT_TYPES, extract_entries
from app.ai.factory import get_provider
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.catalog import CatalogEntry, EntryStatus, EntryVisibility
from app.models.user import Role, User
from app.routers.catalogs import provider_catalog
from app.schemas.catalog import AutoCatalogResult, EntryOut
from app.uploads import read_capped

logger = logging.getLogger("app.auto_catalog")

router = APIRouter(prefix="/me/auto-catalog", tags=["auto-catalog"])

_provider_only = require_role(Role.content_provider)


@router.post("/import", response_model=AutoCatalogResult, status_code=status.HTTP_201_CREATED)
async def import_document(
    file: UploadFile,
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> AutoCatalogResult:
    """Import a document into 1..N AI-generated draft entries (AC64–AC67).

    Validates type + size at the boundary (AC64), extracts via the AC16 seam (AC65), structures into
    draft entries with full field inference (AC66), and persists them as hidden drafts with the
    AI-created marker in the provider's catalog (AC67/AC68)."""
    if not provider.approved:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your organization is pending verification")
    content_type = (file.content_type or "").lower()
    if content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Unsupported document type; allowed: PDF, PNG, JPEG",
        )
    data = await read_capped(file)  # 25 MB cap (AC64); refuses oversize with 413
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The uploaded file is empty")

    ai_provider = get_provider(settings)
    proposals = extract_entries(file.filename or "", content_type, data, ai_provider)

    catalog = provider_catalog(db, provider)
    org_name = provider.tenant.name if provider.tenant else ""
    created: list[CatalogEntry] = []
    for fields in proposals:
        entry = CatalogEntry(
            catalog_id=catalog.id,
            type=fields["type"],
            title=fields["title"],
            description=fields["description"],
            destination=fields["destination"],
            country=fields["country"],
            state=fields["state"],
            city=fields["city"],
            season=fields["season"],
            market_tags=fields["market_tags"],
            attributes=fields["attributes"],
            highlights=fields["highlights"],
            # Contract 1 (AC67): generated content is a hidden, unapproved draft until acted on.
            visibility=EntryVisibility.draft,
            status=EntryStatus.draft,
            brand_safe=False,
            ai_created=True,  # AC68 marker
            provider_id=provider.id,
            created_by_email=provider.email,
            org_name=org_name,
        )
        db.add(entry)
        created.append(entry)
    db.commit()
    for entry in created:
        db.refresh(entry)

    # Contracts 2 & 5: log counts + provider name only — never document text, keys, or raw PII.
    logger.info(
        "auto-catalog import: provider_id=%s ai_provider=%s drafts=%d",
        provider.id,
        ai_provider.name,
        len(created),
    )
    return AutoCatalogResult(
        count=len(created), entries=[EntryOut.from_entry(e, now=now) for e in created]
    )

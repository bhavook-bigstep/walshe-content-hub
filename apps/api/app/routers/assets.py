"""Asset routes (AC4): upload an image for an entry -> storage; serve it back."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app import clock
from app.deps import get_current_user, get_db, require_role
from app.models.catalog import Asset, CatalogEntry, Item, ItemKind
from app.models.user import Role, User
from app.services.visibility import can_read_object
from app.storage.minio_client import Storage
from app.uploads import read_capped

router = APIRouter(tags=["assets"])

_provider_only = require_role(Role.content_provider)

# Raster image types only. SVG and HTML are deliberately excluded: both can carry active markup
# (Contract 2 / stored-XSS) and must never be stored or served as inline documents.
_ALLOWED_IMAGE_TYPES = frozenset(
    {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"}
)
# Video containers allowed for media items + uploads (AC50/AC51). Served as attachments, nosniff.
_ALLOWED_VIDEO_TYPES = frozenset({"video/mp4", "video/webm", "video/quicktime"})
_ALLOWED_MEDIA_TYPES = _ALLOWED_IMAGE_TYPES | _ALLOWED_VIDEO_TYPES


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


@router.post("/catalog/{entry_id}/image", status_code=status.HTTP_201_CREATED)
async def upload_image(
    entry_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    provider: User = Depends(_provider_only),
) -> dict[str, str]:
    entry = db.get(CatalogEntry, entry_id)
    if entry is None or entry.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    # Validate the upload at the boundary: the provider-controlled content-type must be a raster
    # image. Anything else (text/html, image/svg+xml, octet-stream, ...) is refused outright so no
    # active markup can be stored and later served inline (stored-XSS defense).
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Unsupported image type; allowed: png, jpeg, gif, webp, avif",
        )
    data = await read_capped(file)
    # Server-generated key: never trust the client filename in a storage path (overwrite/traversal).
    key = f"entries/{entry_id}/{uuid.uuid4().hex}"
    storage.put_object(key, data, content_type)
    asset = Asset(entry_id=entry_id, object_key=key, content_type=content_type)
    db.add(asset)
    db.commit()
    return {"object_key": key, "content_type": content_type}


@router.post("/catalog/{entry_id}/items/media", status_code=status.HTTP_201_CREATED)
async def upload_media_item(
    entry_id: int,
    file: UploadFile,
    title: str = Form(default="", max_length=300),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    provider: User = Depends(_provider_only),
) -> dict[str, str]:
    """Add an image or video media item to an entry (AC50). Stored in the provider's media store."""
    entry = db.get(CatalogEntry, entry_id)
    if entry is None or entry.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Unsupported media type; allowed: png, jpeg, gif, webp, avif, mp4, webm, mov",
        )
    data = await read_capped(file)
    key = f"entries/{entry_id}/items/{uuid.uuid4().hex}"
    storage.put_object(key, data, content_type)
    kind = ItemKind.video if content_type in _ALLOWED_VIDEO_TYPES else ItemKind.image
    item = Item(
        entry_id=entry_id, kind=kind, title=title, object_key=key, content_type=content_type
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": str(item.id), "object_key": key, "content_type": content_type, "kind": kind.value}


@router.get("/assets/{object_key:path}")
def fetch_asset(
    object_key: str,
    storage: Storage = Depends(get_storage),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> Response:
    # 404 (not 403) for hidden and unknown keys alike, so keys cannot be probed. Covers all three
    # media stores (catalog assets + items, and personal user assets).
    if not can_read_object(db, current, object_key, now=now):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    try:
        data, content_type = storage.get_object(object_key)
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found") from None
    # Defense in depth: even though only validated raster images are ever stored, forbid
    # content-sniffing and never let the bytes be interpreted as an inline document.
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "attachment",
        },
    )

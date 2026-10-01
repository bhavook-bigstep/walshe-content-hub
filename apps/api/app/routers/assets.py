"""Asset routes (AC4): upload an image for an entry -> storage; serve it back."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db, require_role
from app.models.catalog import Asset, CatalogEntry
from app.models.user import Role, User
from app.services.visibility import visible_asset_or_none
from app.storage.minio_client import Storage

router = APIRouter(tags=["assets"])

_provider_only = require_role(Role.content_provider)

# Raster image types only. SVG and HTML are deliberately excluded: both can carry active markup
# (Contract 2 / stored-XSS) and must never be stored or served as inline documents.
_ALLOWED_IMAGE_TYPES = frozenset(
    {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"}
)


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
    data = await file.read()
    key = f"entries/{entry_id}/{file.filename}"
    storage.put_object(key, data, content_type)
    asset = Asset(entry_id=entry_id, object_key=key, content_type=content_type)
    db.add(asset)
    db.commit()
    return {"object_key": key, "content_type": content_type}


@router.get("/assets/{object_key:path}")
def fetch_asset(
    object_key: str,
    storage: Storage = Depends(get_storage),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    # 404 (not 403) for hidden and unknown keys alike, so keys cannot be probed.
    if visible_asset_or_none(db, current, object_key) is None:
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

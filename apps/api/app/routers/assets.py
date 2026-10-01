"""Asset routes (AC4): upload an image for an entry -> storage; serve it back."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.catalog import Asset, CatalogEntry
from app.models.user import Role, User
from app.storage.minio_client import Storage

router = APIRouter(tags=["assets"])

_provider_only = require_role(Role.content_provider)


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
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
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
) -> Response:
    try:
        data, content_type = storage.get_object(object_key)
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found") from None
    return Response(content=data, media_type=content_type)

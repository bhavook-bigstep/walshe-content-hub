"""Personal media storage (AC51).

Every user has their own storage (their ``users/<id>/`` prefix). Assets are tagged by **source** —
``local`` (the user uploaded it) or ``agent`` (an AI service generated it) — and surface in the
studio as the Local and Agent picker sections. Uploads accept image/video/text; generation makes
image + text only (animation comes from sprites). Owner-scoped: a user only ever sees their own.
"""

from __future__ import annotations

import struct
import uuid
import zlib

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models.catalog import ItemKind, UserAsset, UserAssetSource
from app.models.user import User
from app.schemas.catalog import GenerateRequest, TextItemCreate, UserAssetOut
from app.storage.minio_client import Storage
from app.uploads import read_capped

router = APIRouter(prefix="/me/library", tags=["me-library"])

_ALLOWED_IMAGE_TYPES = frozenset(
    {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"}
)
_ALLOWED_VIDEO_TYPES = frozenset({"video/mp4", "video/webm", "video/quicktime"})
_ALLOWED_UPLOAD_TYPES = _ALLOWED_IMAGE_TYPES | _ALLOWED_VIDEO_TYPES


def _get_storage(request: Request) -> Storage:
    return request.app.state.storage


def _solid_png(rgb: tuple[int, int, int], size: int = 32) -> bytes:
    """A deterministic solid-colour PNG — the PoC stand-in for a generated image (hermetic, no
    external image model). Swapped for a real model only when one is configured."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        crc = struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + body + crc

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    raw = (b"\x00" + bytes(rgb) * size) * size
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


@router.post("/upload", response_model=UserAssetOut, status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile,
    title: str = Form(default="", max_length=300),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(_get_storage),
) -> UserAssetOut:
    """Upload an image or video into your Local storage (AC51)."""
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_UPLOAD_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Unsupported type; allowed: png, jpeg, gif, webp, avif, mp4, webm, mov",
        )
    data = await read_capped(file)
    key = f"users/{user.id}/{uuid.uuid4().hex}"
    storage.put_object(key, data, content_type)
    kind = ItemKind.video if content_type in _ALLOWED_VIDEO_TYPES else ItemKind.image
    asset = UserAsset(
        owner_id=user.id, source=UserAssetSource.local, kind=kind, title=title,
        object_key=key, content_type=content_type,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return UserAssetOut.model_validate(asset)


@router.post("/text", response_model=UserAssetOut, status_code=status.HTTP_201_CREATED)
def add_text(
    body: TextItemCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> UserAssetOut:
    """Save a text snippet into your Local storage (AC51)."""
    asset = UserAsset(
        owner_id=user.id, source=UserAssetSource.local, kind=ItemKind.text,
        title=body.title, text=body.text,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return UserAssetOut.model_validate(asset)


@router.post("/generate", response_model=list[UserAssetOut], status_code=status.HTTP_201_CREATED)
def generate(
    body: GenerateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(_get_storage),
) -> list[UserAssetOut]:
    """Generate an image + text into your Agent storage (AC51). Deterministic PoC stub — image +
    text only; no generated video/animation (that comes from sprites)."""
    seed = zlib.crc32(body.prompt.strip().lower().encode())
    rgb = ((seed >> 16) & 0xFF, (seed >> 8) & 0xFF, seed & 0xFF)
    key = f"users/{user.id}/{uuid.uuid4().hex}"
    storage.put_object(key, _solid_png(rgb), "image/png")
    image = UserAsset(
        owner_id=user.id, source=UserAssetSource.agent, kind=ItemKind.image,
        title=body.prompt[:120], object_key=key, content_type="image/png",
    )
    text = UserAsset(
        owner_id=user.id, source=UserAssetSource.agent, kind=ItemKind.text,
        title=body.prompt[:120], text=f"{body.prompt.strip()}",
    )
    db.add_all([image, text])
    db.commit()
    db.refresh(image)
    db.refresh(text)
    return [UserAssetOut.model_validate(image), UserAssetOut.model_validate(text)]


@router.get("", response_model=list[UserAssetOut])
def list_media(
    source: UserAssetSource | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserAssetOut]:
    """List the caller's own assets, optionally filtered by source (Local / Agent). Owner-scoped."""
    stmt = select(UserAsset).where(UserAsset.owner_id == user.id)
    if source is not None:
        stmt = stmt.where(UserAsset.source == source)
    rows = db.execute(stmt.order_by(UserAsset.id)).scalars().all()
    return [UserAssetOut.model_validate(a) for a in rows]

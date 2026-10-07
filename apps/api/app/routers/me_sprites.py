"""Imported sprite animations.

Upload a sprite sheet — a PNG filmstrip/grid, or a ZIP of them — and the server slices it into
ordered frame images stored under the owner's ``users/<id>/sprites/<sprite id>/`` prefix (served by
the owner-only asset gate). The studio lists these and inserts them as frame-by-frame sprites, so an
agent can bring their own characters/animations. Owner-scoped.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.media.sprites import MAX_SPRITES_PER_IMPORT, import_sprites
from app.models.agent_features import UserSprite
from app.models.user import User
from app.schemas.agent import UserSpriteOut
from app.storage.minio_client import Storage
from app.uploads import read_capped

router = APIRouter(prefix="/me/sprites", tags=["me-sprites"])

_ALLOWED_TYPES = frozenset(
    {"image/png", "application/zip", "application/x-zip-compressed", "application/octet-stream"}
)


def _get_storage(request: Request) -> Storage:
    return request.app.state.storage


@router.post("/import", response_model=list[UserSpriteOut], status_code=status.HTTP_201_CREATED)
async def import_sprite_sheets(
    file: UploadFile,
    cols: int | None = Form(default=None),
    rows: int | None = Form(default=None),
    fps: int = Form(default=10),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(_get_storage),
) -> list[UserSpriteOut]:
    """Slice an uploaded sprite sheet (PNG) or a ZIP of sheets into frame images and save them as
    the caller's sprites. `cols`/`rows` override the auto-detected grid; `fps` sets the speed."""
    content_type = (file.content_type or "").lower()
    filename = file.filename or ""
    low = filename.lower()
    if content_type not in _ALLOWED_TYPES and not (low.endswith(".png") or low.endswith(".zip")):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Upload a PNG sprite sheet or a ZIP of PNG sheets.",
        )
    data = await read_capped(file)
    imported = import_sprites(
        data, content_type=content_type, filename=filename, cols=cols, rows=rows
    )
    if not imported:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No sprite frames found — check the file is a sprite sheet (a strip/grid of frames).",
        )
    fps = max(1, min(30, fps))
    saved: list[UserSprite] = []
    for sp in imported[:MAX_SPRITES_PER_IMPORT]:
        sprite = UserSprite(
            owner_id=user.id,
            name=sp.name[:160] or "Sprite",
            fps=fps,
            frame_width=sp.frame_width,
            frame_height=sp.frame_height,
            frame_keys=[],
        )
        db.add(sprite)
        db.flush()  # assign the id for the storage prefix
        keys: list[str] = []
        for i, frame in enumerate(sp.frames):
            key = f"users/{user.id}/sprites/{sprite.id}/frame_{i:03d}.png"
            storage.put_object(key, frame, "image/png")
            keys.append(key)
        sprite.frame_keys = keys
        saved.append(sprite)
    db.commit()
    for s in saved:
        db.refresh(s)
    return [UserSpriteOut.model_validate(s) for s in saved]


@router.get("", response_model=list[UserSpriteOut])
def list_sprites(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[UserSpriteOut]:
    """List the caller's imported sprites (newest first). Owner-scoped."""
    rows = (
        db.execute(
            select(UserSprite).where(UserSprite.owner_id == user.id).order_by(UserSprite.id.desc())
        )
        .scalars()
        .all()
    )
    return [UserSpriteOut.model_validate(s) for s in rows]


@router.delete("/{sprite_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sprite(
    sprite_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    """Delete one of the caller's sprites (the frame objects are left in storage, owner-only)."""
    sprite = db.get(UserSprite, sprite_id)
    if sprite is None or sprite.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sprite not found")
    db.delete(sprite)
    db.commit()

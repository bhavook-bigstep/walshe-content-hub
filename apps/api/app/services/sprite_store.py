"""Persist sliced sprites (``ImportedSprite``) as the owner's ``UserSprite`` rows + MinIO frames.

Shared by the upload route (``/me/sprites/import``) and the agentic sprite generator, so both store
sprites identically — owner-scoped ``users/<id>/sprites/<id>/`` prefix behind the owner-only asset
gate — and a generated sprite is an ordinary owner sprite the studio already knows how to resolve.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.media.sprites import MAX_SPRITES_PER_IMPORT, ImportedSprite
from app.models.agent_features import UserSprite
from app.storage.minio_client import Storage


def store_sprites(
    db: Session,
    storage: Storage,
    owner_id: int,
    imported: list[ImportedSprite],
    fps: int,
) -> list[UserSprite]:
    """Save each sliced sprite as a ``UserSprite`` (frames → MinIO under the owner's prefix).

    Commits and returns the refreshed rows. ``fps`` is clamped to the playable range.
    """
    fps = max(1, min(30, fps))
    saved: list[UserSprite] = []
    for sp in imported[:MAX_SPRITES_PER_IMPORT]:
        sprite = UserSprite(
            owner_id=owner_id,
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
            key = f"users/{owner_id}/sprites/{sprite.id}/frame_{i:03d}.png"
            storage.put_object(key, frame, "image/png")
            keys.append(key)
        sprite.frame_keys = keys
        saved.append(sprite)
    db.commit()
    for s in saved:
        db.refresh(s)
    return saved

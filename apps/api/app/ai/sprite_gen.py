"""Agentic sprite generation: a text concept → an LLM image sprite sheet → sliced frames → a
persisted ``UserSprite`` the studio can place.

It reuses the SAME slicer (``media.sprites.import_sprites``) and storage (``services.sprite_store``)
as the manual upload route, so a generated sprite is an ordinary owner sprite (``user:<id>``) the
studio already resolves. The image provider has a deterministic stub (no key), so the whole path is
hermetic in tests (Contract 4) — the stub yields a single-frame solid sprite rather than an
animation. The image-gen key comes from env only and is never logged (Contract 2).

NOTE: generated sprites are UNMODERATED decorative content — they are not catalog entries and carry
no brand-safety guarantee; they are stored owner-scoped behind the owner-only asset gate.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.ai.images import generate_image
from app.config import Settings
from app.media.sprites import import_sprites
from app.models.agent_features import UserSprite
from app.services.sprite_store import store_sprites
from app.storage.minio_client import Storage


def sprite_sheet_prompt(concept: str, cols: int | None, rows: int | None) -> str:
    """Turn a sprite concept into an image prompt for a clean, sliceable filmstrip."""
    frames = max(2, (cols or 6) * (rows or 1))
    layout = (
        f"a single horizontal strip of {frames} equal square frames"
        if not rows or rows == 1
        else f"a {cols or 1}x{rows} grid of equal square frames"
    )
    return (
        f"A sprite sheet for 2D frame-by-frame animation of: {concept.strip()}. "
        f"{layout} showing the motion cycle in order, evenly spaced with consistent size and "
        "centering, flat art on a fully transparent background, no text, labels, or grid lines."
    )


@dataclass(frozen=True)
class GeneratedSprite:
    sprite: UserSprite
    """The sliced frames as data: URLs — for immediate placement without a fetch (the node also
    carries ``sprite:"user:<id>"`` so it re-resolves from storage on reload)."""
    frames_data_urls: list[str]
    provider: str


def generate_sprite(
    settings: Settings,
    db: Session,
    storage: Storage,
    owner_id: int,
    concept: str,
    *,
    cols: int | None = None,
    rows: int | None = None,
    fps: int = 10,
) -> GeneratedSprite:
    """Generate a sprite sheet from ``concept``, slice it, and persist it as the owner's sprite.

    Raises ``ValueError`` when the generated image yields no frames, so the caller can report it
    without a 500. Deterministic under the image stub (no key): same concept → same sprite.
    """
    picture = generate_image(settings, sprite_sheet_prompt(concept, cols, rows))
    imported = import_sprites(
        picture.data,
        content_type=picture.content_type or "image/png",
        filename="generated.png",
        cols=cols,
        rows=rows,
    )
    if not imported:
        raise ValueError("the generated image yielded no sprite frames")
    # One sprite from the sheet (the first/only strip); store it like an upload.
    saved = store_sprites(db, storage, owner_id, imported[:1], fps)
    data_urls = [
        "data:image/png;base64," + base64.b64encode(frame).decode("ascii")
        for frame in imported[0].frames
    ]
    return GeneratedSprite(sprite=saved[0], frames_data_urls=data_urls, provider=picture.provider)

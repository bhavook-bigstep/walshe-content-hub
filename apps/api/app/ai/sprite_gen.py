"""Agentic sprite generation: a concept → N generated frame images → a persisted ``UserSprite``.

Image models reliably render ONE clean subject per call but do NOT produce an evenly-gridded sprite
sheet, so instead of slicing a sheet we generate N separate frames — one per phase of the motion —
and assemble them into the filmstrip. Each frame is normalised to a common size so they swap clean.
It reuses the SAME storage (``services.sprite_store``) as the manual upload route, so a generated
sprite is an ordinary owner sprite (``user:<id>``) the studio already resolves.

Determinism (Contract 4): the image provider has a deterministic stub (no key) — each frame prompt
differs, so the stub yields N distinct solid frames (a visibly cycling sprite) with no network. The
image-gen key comes from env only and is never logged (Contract 2).

Cross-frame consistency is imperfect (separate diffusion calls drift), so N is capped and the per-
frame prompt pins the subject and varies only the pose. NOTE: generated sprites are UNMODERATED
decorative content — not catalog entries, stored owner-scoped behind the owner-only asset gate.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

from PIL import Image, ImageChops
from sqlalchemy.orm import Session

from app.ai.images import generate_image
from app.config import Settings
from app.media.sprites import ImportedSprite
from app.models.agent_features import UserSprite
from app.services.sprite_store import store_sprites
from app.storage.minio_client import Storage

# Keep N small: more frames = more image calls + more character drift between them.
MIN_FRAMES = 2
MAX_FRAMES = 8
_FRAME_SIZE = 256  # frames are letterboxed onto a transparent square so the filmstrip is uniform


def frame_prompt(concept: str, index: int, total: int) -> str:
    """The prompt for ONE motion frame: same subject, only the pose advances through the cycle."""
    phase = round(100 * index / max(1, total - 1)) if total > 1 else 0
    return (
        f"A single frame of a 2D frame-by-frame animation of {concept.strip()}. "
        f"Frame {index + 1} of {total} — the pose at {phase}% through the motion cycle. "
        "The SAME character throughout: identical design, colours, proportions, size and facing; "
        "only the pose/motion changes between frames. One subject, centred, fully in view, flat "
        "art on a plain solid pure-white background (#FFFFFF, no gradient or shadow) so the "
        "background can be removed. No text, no borders, no grid, no duplicate copies."
    )


# Image models won't emit clean transparency, but they DO honour a solid white background — which we
# key out locally (pure Pillow, no external service) so the frame drops onto the canvas cleanly.
_WHITE_THRESHOLD = 240


def remove_white_bg(img: Image.Image, threshold: int = _WHITE_THRESHOLD) -> Image.Image:
    """Make a near-white background transparent: pixels with every channel ≥ ``threshold`` get
    alpha 0. Vectorised via Pillow band ops (no numpy), so it's fast enough to run per frame."""
    img = img.convert("RGBA")
    r, g, b, a = img.split()

    def at_least(band: Image.Image) -> Image.Image:
        return band.point(lambda p: 255 if p >= threshold else 0)

    white = ImageChops.multiply(ImageChops.multiply(at_least(r), at_least(g)), at_least(b))
    keep = white.point(lambda p: 0 if p >= 255 else 255)  # 0 where white, 255 elsewhere
    img.putalpha(ImageChops.multiply(a, keep))  # zero the alpha on the white background
    return img


def _normalize_frame(png_bytes: bytes, size: int = _FRAME_SIZE) -> bytes:
    """Key out the white background, then letterbox onto a transparent ``size × size`` canvas so all
    frames share one box."""
    img = remove_white_bg(Image.open(io.BytesIO(png_bytes)))
    img.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2), img)
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


@dataclass(frozen=True)
class GeneratedSprite:
    sprite: UserSprite
    """The frames as data: URLs — for immediate placement without a fetch (the node also carries
    ``sprite:"user:<id>"`` so it re-resolves from storage on reload)."""
    frames_data_urls: list[str]
    provider: str


def generate_sprite(
    settings: Settings,
    db: Session,
    storage: Storage,
    owner_id: int,
    concept: str,
    *,
    frames: int = 4,
    fps: int = 10,
) -> GeneratedSprite:
    """Generate ``frames`` motion frames for ``concept`` and persist them as the owner's sprite.

    Raises ``ValueError`` if no frame renders. Deterministic under the image stub (no key).
    """
    n = max(MIN_FRAMES, min(MAX_FRAMES, frames))
    provider = "stub"
    rendered: list[bytes] = []
    for i in range(n):
        picture = generate_image(settings, frame_prompt(concept, i, n))
        provider = picture.provider
        try:
            rendered.append(_normalize_frame(picture.data))
        except Exception:  # noqa: BLE001 - a bad frame is skipped, not fatal (unless none render)
            continue
    if not rendered:
        raise ValueError("no sprite frames could be generated")

    name = concept.strip()[:60] or "Sprite"
    imported = ImportedSprite(
        name=name, frames=rendered, frame_width=_FRAME_SIZE, frame_height=_FRAME_SIZE
    )
    saved = store_sprites(db, storage, owner_id, [imported], fps)
    data_urls = [
        "data:image/png;base64," + base64.b64encode(frame).decode("ascii") for frame in rendered
    ]
    return GeneratedSprite(sprite=saved[0], frames_data_urls=data_urls, provider=provider)

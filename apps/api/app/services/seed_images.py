"""Deterministic scenic cover images for seed entries (AC4/AC17).

Pillow-drawn, no network: the demo always has photo-led catalog art and the Design Studio has real,
droppable media in MinIO/the on-disk store — not a flat placeholder. Same seed → same bytes
(Contract 4). Palettes mirror the web studio's fallback scenes so the look is consistent.
"""

from __future__ import annotations

import io
import math
import zlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.catalog import CatalogEntry

RGB = tuple[int, int, int]
Palette = tuple[RGB, RGB, RGB, list[RGB]]  # (sky_top, sky_bottom, sun, [hill_far, mid, near])

_PALETTES: list[Palette] = [
    # alpine dusk
    ((30, 58, 138), (99, 102, 241), (252, 211, 77), [(15, 23, 42), (30, 41, 59), (51, 65, 85)]),
    # coast sunset
    ((251, 146, 60), (253, 230, 138), (255, 247, 237),
     [(124, 45, 18), (154, 52, 18), (194, 65, 12)]),
    # forest morning
    ((110, 231, 183), (254, 249, 195), (254, 243, 199), [(6, 78, 59), (6, 95, 70), (4, 120, 87)]),
    # desert
    ((253, 186, 116), (254, 243, 199), (255, 251, 235),
     [(146, 64, 14), (180, 83, 9), (217, 119, 6)]),
    # ocean teal
    ((153, 246, 228), (236, 254, 255), (255, 255, 255),
     [(15, 118, 110), (17, 94, 89), (20, 184, 166)]),
]


def _lerp(a: RGB, b: RGB, t: float) -> RGB:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def stable_seed(text: str) -> int:
    """A process-stable seed from a string (Python's hash() is salted, so use CRC32)."""
    return zlib.crc32(text.encode("utf-8"))


def scene_png(seed: int, width: int = 1080, height: int = 1350) -> bytes:
    """A stylised destination scene (sky gradient, glowing sun, three hill silhouettes)."""
    from PIL import Image, ImageDraw

    p_sky_top, p_sky_bottom, p_sun, p_hills = _PALETTES[seed % len(_PALETTES)]
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img, "RGBA")

    # Sky gradient (row by row).
    for y in range(height):
        draw.line([(0, y), (width, y)], fill=_lerp(p_sky_top, p_sky_bottom, y / height))

    # Sun with a soft glow (position varies with the seed).
    sx = width * (0.5 + ((seed >> 3) % 30) / 100)
    sy = height * 0.26
    r = width * 0.16
    for k in range(10, 0, -1):
        rr = r * (0.6 + k * 0.18)
        alpha = int(26 * (k / 10))
        draw.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=(*p_sun, alpha))
    draw.ellipse([sx - r * 0.6, sy - r * 0.6, sx + r * 0.6, sy + r * 0.6], fill=(*p_sun, 235))

    # Three overlapping hill silhouettes, far (high) to near (low).
    for i in range(3):
        base_y = height * (0.5 + i * 0.13)
        amp = height * (0.06 + 0.03 * ((seed >> (i + 1)) % 3))
        phase = ((seed >> (i * 2)) % 10) / 10
        pts = [(0, height), (0, base_y)]
        segments = 48
        for x in range(segments + 1):
            px = x / segments * width
            py = base_y - math.sin(x / segments * math.pi * 1.5 + phase * math.pi * 2 + i) * amp
            pts.append((px, py))
        pts.append((width, height))
        draw.polygon(pts, fill=p_hills[i])

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _fetch_photo(
    seed: int, width: int = 1080, height: int = 1350, timeout: float = 6.0
) -> bytes | None:
    """Download a real, deterministic scenic photo (Picsum) for a demo-quality catalog. Returns the
    JPEG bytes, or None on any failure so the caller can fall back to the drawn scene."""
    import urllib.request

    url = f"https://picsum.photos/seed/{seed}/{width}/{height}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "walsh-content-hub-seed"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed https host)
            data = resp.read()
        return data or None
    except Exception:
        return None


def seed_covers(db: "Session", entries: list["CatalogEntry"]) -> None:
    """Give each entry a cover image in the configured object store (MinIO in compose, the on-disk
    store in local dev) and connect it to the entry: sets ``cover_object_key`` and adds an ``Asset``
    (so a later decompose turns it into an image item). Idempotent and best-effort. Used by both
    seeds.

    When ``SEED_FETCH_PHOTOS`` is set (the dev launcher / demo turn it on), each cover is a real
    deterministic photo; otherwise — and offline, or under tests — it's a drawn scene, so the seed
    stays hermetic and reproducible."""
    import os

    from app.config import get_settings
    from app.models.catalog import Asset
    from app.storage.minio_client import get_storage

    try:
        storage = get_storage(get_settings())
    except Exception:
        return
    fetch_photos = bool(os.environ.get("SEED_FETCH_PHOTOS"))
    db.flush()  # ensure every entry has an id for the object key
    for entry in entries:
        if entry.cover_object_key or entry.assets:
            continue  # already has media (re-run safe)
        seed = stable_seed(entry.title)
        photo = _fetch_photo(seed) if fetch_photos else None
        if photo is not None:
            data, content_type, ext = photo, "image/jpeg", "jpg"
        else:
            data, content_type, ext = scene_png(seed), "image/png", "png"
        key = f"catalog/seed/{entry.id}/cover.{ext}"
        try:
            storage.put_object(key, data, content_type)
        except Exception:
            continue  # don't point a cover at bytes we failed to store
        entry.cover_object_key = key
        entry.cover_content_type = content_type
        db.add(Asset(entry_id=entry.id, object_key=key, content_type=content_type))
    db.flush()

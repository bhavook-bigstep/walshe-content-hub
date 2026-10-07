"""Deterministic, on-theme cover + gallery images for seed entries (AC4/AC17).

Pillow-drawn, no network: the demo always has photo-led catalog art and the Design Studio has real,
droppable media in MinIO/the on-disk store. Crucially the art is **accurate** — each image is themed
by the entry's type and labelled with its title + destination — so a festival never shows an
unrelated stock photo. Same seed → same bytes (Contract 4).
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

# One palette per catalog type, so the cover reads as the right kind of thing at a glance.
_TYPE_PALETTES: dict[str, Palette] = {
    # event — festive dusk, warm sun
    "event": ((76, 29, 149), (236, 72, 153), (253, 224, 71),
              [(49, 10, 101), (91, 33, 182), (124, 58, 237)]),
    # place — forest morning
    "place": ((16, 185, 129), (209, 250, 229), (254, 243, 199),
              [(6, 78, 59), (6, 95, 70), (4, 120, 87)]),
    # itinerary — ocean teal
    "itinerary": ((14, 116, 144), (165, 243, 252), (255, 255, 255),
                  [(8, 51, 68), (14, 116, 144), (34, 211, 238)]),
    # offer — coast sunset
    "offer": ((249, 115, 22), (254, 215, 170), (255, 247, 237),
              [(124, 45, 18), (154, 52, 18), (194, 65, 12)]),
    # opportunity — alpine dusk
    "opportunity": ((30, 58, 138), (99, 102, 241), (252, 211, 77),
                    [(15, 23, 42), (30, 41, 59), (51, 65, 85)]),
}
_DEFAULT_PALETTE: Palette = _TYPE_PALETTES["place"]
_TYPE_LABEL = {
    "event": "EVENT", "place": "PLACE", "itinerary": "ITINERARY",
    "offer": "SPECIAL OFFER", "opportunity": "OPPORTUNITY",
}

# Fonts: try a few common system faces; fall back to Pillow's bitmap font (text just renders small).
_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def _font(size: int):
    from PIL import ImageFont

    for path in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _lerp(a: RGB, b: RGB, t: float) -> RGB:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def stable_seed(text: str) -> int:
    """A process-stable seed from a string (Python's hash() is salted, so use CRC32)."""
    return zlib.crc32(text.encode("utf-8"))


def _draw_scene(draw, seed: int, palette: Palette, width: int, height: int) -> None:
    """Sky gradient + glowing sun + three layered hill silhouettes (the scenic backdrop)."""
    p_sky_top, p_sky_bottom, p_sun, p_hills = palette
    for y in range(height):
        draw.line([(0, y), (width, y)], fill=_lerp(p_sky_top, p_sky_bottom, y / height))
    sx = width * (0.5 + ((seed >> 3) % 30) / 100)
    sy = height * 0.26
    r = width * 0.16
    for k in range(10, 0, -1):
        rr = r * (0.6 + k * 0.18)
        draw.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=(*p_sun, int(26 * (k / 10))))
    draw.ellipse([sx - r * 0.6, sy - r * 0.6, sx + r * 0.6, sy + r * 0.6], fill=(*p_sun, 235))
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


def scene_png(
    seed: int,
    *,
    title: str = "",
    subtitle: str = "",
    type_: str = "place",
    width: int = 1080,
    height: int = 1350,
) -> bytes:
    """A stylised, type-themed destination banner labelled with its title + destination."""
    from PIL import Image, ImageDraw

    palette = _TYPE_PALETTES.get(type_, _DEFAULT_PALETTE)
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img, "RGBA")
    _draw_scene(draw, seed, palette, width, height)

    if title:
        # Legibility scrim fading up from the base, then the labels.
        scrim_top = int(height * 0.60)
        for y in range(scrim_top, height):
            a = int(200 * (y - scrim_top) / (height - scrim_top))
            draw.line([(0, y), (width, y)], fill=(8, 15, 20, a))
        pad = int(width * 0.06)
        # Type tag.
        tag = _TYPE_LABEL.get(type_, type_.upper())
        tagf = _font(max(18, width // 44))
        tb = draw.textbbox((0, 0), tag, font=tagf)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        draw.rounded_rectangle(
            [pad, int(height * 0.70), pad + tw + 36, int(height * 0.70) + th + 24],
            radius=(th + 24) // 2, fill=(*palette[2], 235),
        )
        draw.text((pad + 18, int(height * 0.70) + 12), tag, font=tagf, fill=(20, 20, 20))
        # Title (wrapped to ~18 chars/line) + destination.
        titlef = _font(max(44, width // 12))
        subf = _font(max(24, width // 34))
        y = int(height * 0.70) + th + 48
        for line in _wrap(title, 18)[:3]:
            draw.text((pad, y), line, font=titlef, fill=(255, 255, 255))
            y += int(titlef.size * 1.08)
        if subtitle:
            draw.text((pad, y + 6), subtitle, font=subf, fill=(226, 232, 240))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _wrap(text: str, width_chars: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        if len(cur) + len(w) + 1 <= width_chars:
            cur = f"{cur} {w}".strip()
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [text]


# Curated Picsum photo IDs that are genuine scenic landscapes (mountains, coast, forest, desert) —
# same pool the web CatalogThumb falls back to, so the look is consistent. Picking by ID (not a
# random seed) gives a REAL, stable, destination-quality photo per entry (never a random mismatch).
_CURATED = [1018, 1015, 1016, 1036, 1039, 1041, 1043, 1044, 1047, 1057, 1061, 29, 28, 110]


def _fetch_photo(photo_id: int, width: int, height: int, timeout: float = 8.0) -> bytes | None:
    """Download a specific curated scenic photo (Picsum by id → deterministic). None on any failure
    so the caller can fall back to a drawn scene (keeps tests/offline hermetic)."""
    import urllib.request

    url = f"https://picsum.photos/id/{photo_id}/{width}/{height}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "walsh-content-hub-seed"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed https host)
            data = resp.read()
        return data or None
    except Exception:
        return None


def seed_covers(db: "Session", entries: list["CatalogEntry"]) -> None:
    """Give each entry a real, destination-quality **cover** photo plus two **gallery** photos in
    the object store, connected as ``Asset``s (so a later decompose turns them into image items).
    Idempotent and best-effort; used by both seeds.

    Photos are REAL curated scenic landscapes picked deterministically per entry (same entry → same
    photo), so a card is always photo-led and consistent — not a random mismatch nor flat art. When
    offline/under tests the download fails and each image falls back to a drawn, labelled scene, so
    the seed stays hermetic + reproducible."""
    import os

    from app.config import get_settings
    from app.models.catalog import Asset
    from app.storage.minio_client import get_storage

    try:
        storage = get_storage(get_settings())
    except Exception:
        return
    # Only hit the network when the dev launcher / demo asks for real photos; tests + offline draw a
    # scene instead, so the seed stays hermetic and fast (no 60 downloads per run).
    fetch_photos = bool(os.environ.get("SEED_FETCH_PHOTOS"))
    db.flush()  # ensure every entry has an id for the object key
    for entry in entries:
        if entry.cover_object_key or entry.assets:
            continue  # already has media (re-run safe)
        seed = stable_seed(entry.title)
        type_ = getattr(entry.type, "value", str(entry.type))
        # Three distinct curated photos per entry (cover + two gallery frames).
        picks = [_CURATED[(seed + k) % len(_CURATED)] for k in range(3)]
        specs = [
            ("cover", picks[0], 1080, 1350, entry.title, entry.destination or ""),
            ("photo-1", picks[1], 1080, 1080, "", ""),
            ("photo-2", picks[2], 1080, 1080, "", ""),
        ]
        stored: list[tuple[str, str]] = []
        for base, pid, w, h, title, subtitle in specs:
            photo = _fetch_photo(pid, w, h) if fetch_photos else None
            if photo is not None:
                data, ctype, ext = photo, "image/jpeg", "jpg"
            else:  # offline / tests → a drawn, labelled scene so the seed stays hermetic
                data = scene_png(seed + pid, title=title, subtitle=subtitle, type_=type_,
                                 width=w, height=h)
                ctype, ext = "image/png", "png"
            key = f"catalog/seed/{entry.id}/{base}.{ext}"
            try:
                storage.put_object(key, data, ctype)
                stored.append((key, ctype))
            except Exception:
                continue
        if not stored:
            continue
        entry.cover_object_key = stored[0][0]
        entry.cover_content_type = stored[0][1]
        for key, ctype in stored:
            # Append to the relationship (not db.add with entry_id) so the entry's already-loaded
            # `assets` collection stays consistent — otherwise a later decompose sees it empty and
            # the entry ends up with only text items (the cause of the missing image items).
            entry.assets.append(Asset(object_key=key, content_type=ctype))
    db.flush()

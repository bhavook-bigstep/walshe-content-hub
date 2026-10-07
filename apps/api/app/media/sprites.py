"""Sprite-sheet import: slice an uploaded PNG filmstrip / grid — or a ZIP of them — into frames.

Pixel-art packs (e.g. CraftPix) ship each action as a horizontal strip of equal, usually square,
frames (`Run.png` 1024×128 = 8 frames of 128×128); a ZIP bundles many such strips. This module is
pure (bytes in → frame bytes out), so it is unit-testable with a synthetic sheet and has no web/DB
dependency. PSD files inside a ZIP are ignored (the PNG strips are what we slice).
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass

from PIL import Image

# Guard-rails so one upload can't explode storage.
MAX_FRAMES_PER_SPRITE = 64
MAX_SPRITES_PER_IMPORT = 60


@dataclass
class ImportedSprite:
    """One sliced sprite: an ordered list of PNG frame bytes plus the frame size."""

    name: str
    frames: list[bytes]
    frame_width: int
    frame_height: int


def detect_grid(width: int, height: int) -> tuple[int, int]:
    """Best-guess (cols, rows) for a sheet of equal frames. Prefers a horizontal strip of square
    frames (the common pixel-art convention): width a multiple of height → cols = width/height."""
    if width <= 0 or height <= 0:
        return (1, 1)
    if width % height == 0 and width // height >= 1:
        return (width // height, 1)
    if height % width == 0 and height // width >= 1:
        return (1, height // width)
    return (1, 1)


def slice_sheet(png_bytes: bytes, cols: int, rows: int) -> tuple[list[bytes], int, int]:
    """Slice a sheet into `cols × rows` equal frames (row-major), each re-encoded as a PNG. Returns
    (frames, frame_width, frame_height). Frames that are fully transparent are dropped (trailing
    blank cells in a grid)."""
    cols = max(1, cols)
    rows = max(1, rows)
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    w, h = img.size
    fw, fh = w // cols, h // rows
    if fw <= 0 or fh <= 0:
        return ([], 0, 0)
    frames: list[bytes] = []
    for r in range(rows):
        for c in range(cols):
            if len(frames) >= MAX_FRAMES_PER_SPRITE:
                break
            crop = img.crop((c * fw, r * fh, c * fw + fw, r * fh + fh))
            if not crop.getbbox():  # fully transparent → skip (trailing empty grid cell)
                continue
            buf = io.BytesIO()
            crop.save(buf, format="PNG")
            frames.append(buf.getvalue())
    return (frames, fw, fh)


def _sprite_from_png(
    name: str, png_bytes: bytes, cols: int | None, rows: int | None
) -> ImportedSprite | None:
    try:
        w, h = Image.open(io.BytesIO(png_bytes)).size
    except Exception:
        return None
    c, r = (cols, rows) if cols and rows else detect_grid(w, h)
    frames, fw, fh = slice_sheet(png_bytes, c, r)
    if not frames:
        return None
    return ImportedSprite(name=name or "sprite", frames=frames, frame_width=fw, frame_height=fh)


def import_sprites(
    data: bytes,
    *,
    content_type: str,
    filename: str,
    cols: int | None = None,
    rows: int | None = None,
) -> list[ImportedSprite]:
    """Turn an uploaded file into one or more sprites. A PNG → a single sprite; a ZIP → one sprite
    per PNG strip inside it (named by the entry, e.g. ``Fighter/Run.png`` → "Fighter Run").
    `cols`/`rows` override the auto-detected grid (for non-square / multi-row sheets)."""
    ct = (content_type or "").lower()
    is_zip = ct in {"application/zip", "application/x-zip-compressed"} or filename.lower().endswith(
        ".zip"
    )
    if is_zip:
        sprites: list[ImportedSprite] = []
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for info in sorted(zf.infolist(), key=lambda i: i.filename):
                if len(sprites) >= MAX_SPRITES_PER_IMPORT:
                    break
                fn = info.filename
                base = fn.rsplit("/", 1)[-1]
                if info.is_dir() or not fn.lower().endswith(".png"):
                    continue
                if "__MACOSX" in fn or base.startswith("."):  # skip macOS resource forks
                    continue
                png = zf.read(info)
                # In a ZIP with no explicit grid, only accept actual filmstrips (a multi-frame
                # grid); this skips loose art like a coupon/cover that isn't a sprite sheet.
                if not (cols and rows):
                    try:
                        w, h = Image.open(io.BytesIO(png)).size
                    except Exception:
                        continue
                    gc, gr = detect_grid(w, h)
                    if gc * gr < 2:
                        continue
                name = fn[:-4].replace("/", " ").replace("_", " ").strip()
                sprite = _sprite_from_png(name, png, cols, rows)
                if sprite:
                    sprites.append(sprite)
        return sprites

    stem = (filename.rsplit("/", 1)[-1].rsplit(".", 1)[0] or "sprite").replace("_", " ").strip()
    sprite = _sprite_from_png(stem, data, cols, rows)
    return [sprite] if sprite else []

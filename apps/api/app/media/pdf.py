"""Design -> PDF (AC12).

A *design* is the serialisable shape the studio exports (``scenesAsPages``):
``{"width", "height", "pages": [{"background", "nodes": [...]}]}``. Each page becomes one PDF page
at the design's own pixel size (1px = 1pt), so the PDF matches the canvas layout — positions, text
styling and shapes. An image node whose ``src`` is an inline ``data:`` URL is embedded (cover-fit,
rounded if the node has a radius); the client inlines its photos to ``data:`` URLs before export, so
no external resource is fetched and no secret is embedded. An image with no inline source falls back
to a neutral placeholder frame.
"""

from __future__ import annotations

import base64
import io
from typing import Any

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

_DEFAULT_W = 1080
_DEFAULT_H = 1080


def _color(value: Any, default: str = "#111111") -> Color:
    try:
        s = str(value) if value else default
        return HexColor(s if s.startswith("#") else default)
    except Exception:
        return HexColor(default)


def _is_transparent(value: Any) -> bool:
    """A colour the user explicitly set to none — drawn as nothing, not as a fallback colour."""
    return str(value or "").strip().lower() == "transparent"


def _font(node: dict[str, Any]) -> str:
    """Map a web font family + weight/style to one of reportlab's standard-14 fonts."""
    fam = str(node.get("fontFamily", "")).lower()
    bold = node.get("fontWeight") == "bold" or "black" in fam or "impact" in fam
    italic = node.get("fontStyle") == "italic"
    if "serif" in fam and "sans" not in fam:
        return {
            (0, 0): "Times-Roman",
            (1, 0): "Times-Bold",
            (0, 1): "Times-Italic",
            (1, 1): "Times-BoldItalic",
        }[(int(bold), int(italic))]
    base = "Courier" if ("mono" in fam or "courier" in fam) else "Helvetica"
    if bold and italic:
        return f"{base}-BoldOblique"
    if bold:
        return f"{base}-Bold"
    if italic:
        return f"{base}-Oblique"
    return base


def _wrap_lines(text: str, font: str, size: float, width: float) -> list[str]:
    """Wrap `text` to `width` like the canvas textbox: each explicit newline is a hard break, and
    each resulting paragraph is word-wrapped to the box width. A zero/negative width disables
    wrapping (one line per paragraph). Blank paragraphs are kept so spacing matches the canvas."""
    lines: list[str] = []
    for para in text.split("\n"):
        wrapped = simpleSplit(para, font, size, width) if width > 0 else [para]
        lines.extend(wrapped or [""])
    return lines


def _draw_text(pdf: canvas.Canvas, node: dict[str, Any], page_h: float) -> None:
    text = str(node.get("text", ""))
    if not text or _is_transparent(node.get("color")):
        return
    size = float(node.get("fontSize", 48) or 48)
    line_h = float(node.get("lineHeight", 1.16) or 1.16) * size
    align = node.get("textAlign", "left")
    x = float(node.get("x", 0))
    w = float(node.get("width", 0))
    top = float(node.get("y", 0))
    font = _font(node)
    pdf.setFont(font, size)
    pdf.setFillColor(_color(node.get("color")))
    pdf.setFillAlpha(float(node.get("opacity", 1) or 1))
    # Wrap each paragraph to the node's box width, like the canvas textbox — otherwise a long line
    # runs the full page width instead of wrapping inside the block.
    lines = _wrap_lines(text, font, size, w)
    # First baseline roughly one cap-height below the node top.
    baseline = page_h - top - size
    for i, line in enumerate(lines):
        ly = baseline - i * line_h
        if align == "center":
            pdf.drawCentredString(x + w / 2, ly, line)
        elif align == "right":
            pdf.drawRightString(x + w, ly, line)
        else:
            pdf.drawString(x, ly, line)
    pdf.setFillAlpha(1)


def _catmull_rom(
    p0: dict[str, Any], p1: dict[str, Any], p2: dict[str, Any], p3: dict[str, Any], t: float
) -> tuple[float, float]:
    """One point on the Catmull-Rom spline p1→p2 at 0≤t≤1 — mirrors the studio's `catmullRom`."""
    t2 = t * t
    t3 = t2 * t

    def f(a: float, b: float, c: float, d: float) -> float:
        return 0.5 * (
            2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3
        )

    return (
        f(float(p0["x"]), float(p1["x"]), float(p2["x"]), float(p3["x"])),
        f(float(p0["y"]), float(p1["y"]), float(p2["y"]), float(p3["y"])),
    )


def _sample_curve(points: list[dict[str, Any]], per_segment: int = 18) -> list[tuple[float, float]]:
    """Sample the smooth curve through `points` into a dense polyline — the Catmull-Rom sampling the
    studio uses (`sampleCurve`), so the PDF curve matches the canvas. 0–2 anchors pass through."""
    pts = [(float(p["x"]), float(p["y"])) for p in points]
    if len(points) <= 2:
        return pts
    out: list[tuple[float, float]] = []
    for i in range(len(points) - 1):
        p0 = points[i - 1] if i - 1 >= 0 else points[i]
        p1 = points[i]
        p2 = points[i + 1]
        p3 = points[i + 2] if i + 2 < len(points) else points[i + 1]
        for s in range(per_segment):
            out.append(_catmull_rom(p0, p1, p2, p3, s / per_segment))
    out.append(pts[-1])
    return out


def _draw_curve(
    pdf: canvas.Canvas, node: dict[str, Any], points: list[dict[str, Any]], page_h: float
) -> None:
    """Stroke an editable curve (a `shape` node carrying ordered `points`) as the smoothed polyline
    through its anchors — not a straight line between the bounding-box corners."""
    sampled = _sample_curve(points)
    if len(sampled) < 2:
        return
    stroke = node.get("stroke") or node.get("color")
    if _is_transparent(stroke):
        return
    pdf.saveState()
    pdf.setStrokeColor(_color(stroke, "#111111"))
    pdf.setLineWidth(float(node.get("strokeWidth", 0) or 4))
    pdf.setStrokeAlpha(float(node.get("opacity", 1) or 1))
    pdf.setLineCap(1)  # round caps/joins so the curve reads smooth, matching the canvas
    pdf.setLineJoin(1)
    path = pdf.beginPath()
    path.moveTo(sampled[0][0], page_h - sampled[0][1])
    for px, py in sampled[1:]:
        path.lineTo(px, page_h - py)
    pdf.drawPath(path, stroke=1, fill=0)
    pdf.restoreState()


def _draw_shape(pdf: canvas.Canvas, node: dict[str, Any], page_h: float) -> None:
    # An editable curve is a shape node carrying `points`; stroke it through its anchors (else it
    # falls into the "line" branch below and flattens to a straight diagonal across its box).
    points = node.get("points")
    if isinstance(points, list) and len(points) >= 2:
        _draw_curve(pdf, node, points, page_h)
        return
    x = float(node.get("x", 0))
    y = float(node.get("y", 0))
    w = float(node.get("width", 0))
    h = float(node.get("height", 0))
    fill = _color(node.get("color", "#2563eb"), "#2563eb")
    stroke = node.get("stroke")
    stroke_w = float(node.get("strokeWidth", 0) or 0)
    has_fill = not _is_transparent(node.get("color"))
    pdf.saveState()
    pdf.setFillAlpha(float(node.get("opacity", 1) or 1))
    pdf.setStrokeAlpha(float(node.get("opacity", 1) or 1))
    pdf.setFillColor(fill)
    has_stroke = bool(stroke) and stroke_w > 0 and not _is_transparent(stroke)
    if has_stroke:
        pdf.setStrokeColor(_color(stroke, "#000000"))
        pdf.setLineWidth(stroke_w)
    shape = node.get("shape")
    bottom = page_h - y - h
    fill_flag = 1 if has_fill else 0
    if shape == "ellipse":
        pdf.ellipse(x, bottom, x + w, bottom + h, stroke=1 if has_stroke else 0, fill=fill_flag)
    elif shape == "line":
        line_color = stroke or node.get("color")
        if not _is_transparent(line_color):
            pdf.setStrokeColor(_color(line_color, "#111111"))
            pdf.setLineWidth(stroke_w or 4)
            pdf.line(x, page_h - y, x + w, page_h - (y + h))
    else:
        radius = float(node.get("radius", 0) or 0)
        if radius > 0:
            pdf.roundRect(x, bottom, w, h, radius, stroke=1 if has_stroke else 0, fill=fill_flag)
        else:
            pdf.rect(x, bottom, w, h, stroke=1 if has_stroke else 0, fill=fill_flag)
    pdf.restoreState()


def _decode_data_url(src: Any) -> bytes | None:
    """Return the raw bytes of a base64 ``data:`` image URL, or ``None`` for anything else.

    Only inline ``data:`` sources are decoded — never ``http``/``blob`` — so the export fetches
    nothing over the network (no egress) and parses the bytes inertly as an image.
    """
    if not isinstance(src, str) or not src.startswith("data:"):
        return None
    header, _, payload = src.partition(",")
    if not payload or ";base64" not in header:
        return None
    try:
        return base64.b64decode(payload, validate=True)
    except Exception:
        return None


def _draw_image(pdf: canvas.Canvas, node: dict[str, Any], page_h: float) -> None:
    """Embed an inline ``data:`` image cover-fitted to the node box (rounded if a radius is set).

    Falls back to a neutral placeholder frame when the node has no decodable inline source.
    """
    # An unfilled media placeholder exports transparent — never a box (matches the client, which
    # drops it before export; this guards a design that reaches the server unprepared).
    if node.get("placeholder"):
        return
    data = _decode_data_url(node.get("src"))
    reader = None
    if data is not None:
        try:
            reader = ImageReader(io.BytesIO(data))
            iw, ih = reader.getSize()
        except Exception:
            reader = None
    if reader is None or iw <= 0 or ih <= 0:
        _draw_image_frame(pdf, node, page_h)
        return

    x = float(node.get("x", 0))
    y = float(node.get("y", 0))
    w = float(node.get("width", 0))
    h = float(node.get("height", 0))
    radius = float(node.get("radius", 0) or 0)
    bottom = page_h - y - h
    pdf.saveState()
    # Clip to the (optionally rounded) node box, then draw the image scaled to *cover* the box
    # (fill it, cropping overflow) exactly like the canvas's object-cover rendering.
    clip = pdf.beginPath()
    if radius > 0:
        clip.roundRect(x, bottom, w, h, radius)
    else:
        clip.rect(x, bottom, w, h)
    pdf.clipPath(clip, stroke=0, fill=0)
    scale = max(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    pdf.drawImage(
        reader,
        x - (dw - w) / 2,
        bottom - (dh - h) / 2,
        width=dw,
        height=dh,
        mask="auto",
        preserveAspectRatio=False,
    )
    pdf.restoreState()


def _draw_image_frame(pdf: canvas.Canvas, node: dict[str, Any], page_h: float) -> None:
    # Neutral placeholder frame preserving the layout (used when an image has no inline source).
    x = float(node.get("x", 0))
    y = float(node.get("y", 0))
    w = float(node.get("width", 0))
    h = float(node.get("height", 0))
    pdf.saveState()
    pdf.setFillColor(HexColor("#e2e8f0"))
    pdf.setStrokeColor(HexColor("#cbd5e1"))
    pdf.setLineWidth(1)
    radius = float(node.get("radius", 0) or 0)
    bottom = page_h - y - h
    if radius > 0:
        pdf.roundRect(x, bottom, w, h, radius, stroke=1, fill=1)
    else:
        pdf.rect(x, bottom, w, h, stroke=1, fill=1)
    pdf.restoreState()


def design_to_pdf(design: dict[str, Any]) -> bytes:
    """Render ``design`` to PDF bytes (one page per design page), matching the canvas layout."""
    pages = design.get("pages") or [{"nodes": []}]
    width = float(design.get("width") or _DEFAULT_W)
    height = float(design.get("height") or _DEFAULT_H)
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(width, height))

    for page in pages:
        bg = page.get("background")
        if bg and not _is_transparent(bg):
            pdf.setFillColor(_color(bg, "#ffffff"))
            pdf.rect(0, 0, width, height, stroke=0, fill=1)
        for node in page.get("nodes", []):
            t = node.get("type")
            if t not in ("text", "shape", "image"):
                continue
            # Honour a node's rotation: Fabric rotates about the object's top-left origin, so rotate
            # the page about that same corner — otherwise a rotated element draws upright.
            angle = float(node.get("angle", 0) or 0)
            rotated = angle % 360 != 0
            if rotated:
                px = float(node.get("x", 0))
                py = height - float(node.get("y", 0))
                pdf.saveState()
                pdf.translate(px, py)
                pdf.rotate(-angle)  # Fabric angle is clockwise; PDF rotate() is counter-clockwise
                pdf.translate(-px, -py)
            if t == "text":
                _draw_text(pdf, node, height)
            elif t == "shape":
                _draw_shape(pdf, node, height)
            elif t == "image":
                _draw_image(pdf, node, height)
            if rotated:
                pdf.restoreState()
        pdf.showPage()

    pdf.save()
    return buffer.getvalue()

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
from reportlab.lib.utils import ImageReader
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
    pdf.setFont(_font(node), size)
    pdf.setFillColor(_color(node.get("color")))
    pdf.setFillAlpha(float(node.get("opacity", 1) or 1))
    # First baseline roughly one cap-height below the node top.
    baseline = page_h - top - size
    for i, line in enumerate(text.split("\n")):
        ly = baseline - i * line_h
        if align == "center":
            pdf.drawCentredString(x + w / 2, ly, line)
        elif align == "right":
            pdf.drawRightString(x + w, ly, line)
        else:
            pdf.drawString(x, ly, line)
    pdf.setFillAlpha(1)


def _draw_shape(pdf: canvas.Canvas, node: dict[str, Any], page_h: float) -> None:
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
            if t == "text":
                _draw_text(pdf, node, height)
            elif t == "shape":
                _draw_shape(pdf, node, height)
            elif t == "image":
                _draw_image(pdf, node, height)
        pdf.showPage()

    pdf.save()
    return buffer.getvalue()

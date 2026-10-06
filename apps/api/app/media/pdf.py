"""Design -> PDF (AC12).

A *design* is the serialisable shape the studio exports (``scenesAsPages``):
``{"width", "height", "pages": [{"background", "nodes": [...]}]}``. Each page becomes one PDF page
at the design's own pixel size (1px = 1pt), so the PDF matches the canvas layout — positions, text
styling and shapes. No external resource is fetched and no secret is embedded; image nodes are laid
out as neutral frames (the real photos appear in the PNG/MP4 exports, which resolve storage).
"""

from __future__ import annotations

import io
from typing import Any

from reportlab.lib.colors import Color, HexColor
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
            (0, 0): "Times-Roman", (1, 0): "Times-Bold",
            (0, 1): "Times-Italic", (1, 1): "Times-BoldItalic",
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


def _draw_image_frame(pdf: canvas.Canvas, node: dict[str, Any], page_h: float) -> None:
    # Neutral placeholder frame preserving the layout (photos render in PNG/MP4 exports).
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
                _draw_image_frame(pdf, node, height)
        pdf.showPage()

    pdf.save()
    return buffer.getvalue()

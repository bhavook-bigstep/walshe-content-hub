"""Design -> PDF (AC12).

A *design* is a serialisable dict: ``{"pages": [{"nodes": [{"type": "text", "text": "..."}]}]}``.
Each page becomes one PDF page (multi-page pamphlets supported). No external resource is fetched
and no secret is embedded — only the design's own text/layout.
"""

from __future__ import annotations

import io
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def design_to_pdf(design: dict[str, Any]) -> bytes:
    """Render ``design`` to PDF bytes (one page per design page)."""
    pages = design.get("pages") or [{"nodes": []}]
    buffer = io.BytesIO()
    width, height = A4
    pdf = canvas.Canvas(buffer, pagesize=A4)

    for page in pages:
        y = height - 72
        for node in page.get("nodes", []):
            if node.get("type") == "text":
                pdf.setFont("Helvetica", 14)
                pdf.drawString(72, y, str(node.get("text", "")))
                y -= 24
        pdf.showPage()  # finalise this page; next iteration draws the following page

    pdf.save()
    return buffer.getvalue()

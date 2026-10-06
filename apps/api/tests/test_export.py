"""AC12 — Export a design to PDF + email HTML (Contract 2: no secrets in output)."""

from __future__ import annotations

import re

from app.media.html_export import design_to_email_html
from app.media.pdf import design_to_pdf

DESIGN = {
    "pages": [
        {"nodes": [{"type": "text", "text": "Discover Galway"}]},
        {"nodes": [{"type": "text", "text": "Book your autumn escape"}]},
    ]
}


def _count_pdf_pages(pdf: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page(?![s])", pdf))


def test_pdf_and_html_from_design(client, agent_headers):
    # Direct function-level checks (pure rendering).
    pdf = design_to_pdf(DESIGN)
    assert pdf.startswith(b"%PDF")
    assert _count_pdf_pages(pdf) == 2  # multi-page pamphlet

    html = design_to_email_html(DESIGN)
    assert "Discover Galway" in html
    assert "Book your autumn escape" in html
    # No key/secret substrings leak into an export.
    assert "api_key" not in html.lower()
    assert "secret" not in html.lower()

    # And over the HTTP boundary (agent-only).
    resp = client.post("/render/pdf", headers=agent_headers, json={"design": DESIGN})
    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF")


def test_pdf_renders_styled_layout_at_design_size():
    # AC12/AC62 — the renderer is coordinate-accurate: the page is the design's own pixel size and
    # styled text + shapes + image frames + background all render into a valid PDF.
    design = {
        "width": 1080,
        "height": 1350,
        "pages": [
            {
                "background": "#0f766e",
                "nodes": [
                    {
                        "type": "text",
                        "text": "Hello\nWorld",
                        "x": 80,
                        "y": 120,
                        "width": 920,
                        "fontSize": 72,
                        "fontWeight": "bold",
                        "textAlign": "center",
                        "color": "#ffffff",
                    },
                    {
                        "type": "shape",
                        "shape": "rect",
                        "x": 80,
                        "y": 400,
                        "width": 320,
                        "height": 120,
                        "color": "#f59e0b",
                        "radius": 24,
                    },
                    {
                        "type": "shape",
                        "shape": "ellipse",
                        "x": 500,
                        "y": 400,
                        "width": 120,
                        "height": 120,
                        "color": "#38bdf8",
                        "stroke": "#0b3d3a",
                        "strokeWidth": 6,
                    },
                    {"type": "image", "x": 80, "y": 600, "width": 400, "height": 300, "radius": 16},
                ],
            }
        ],
    }
    pdf = design_to_pdf(design)
    assert pdf.startswith(b"%PDF")
    assert _count_pdf_pages(pdf) == 1
    # The page MediaBox carries the design's pixel size (1080x1350).
    assert b"1080 1350" in pdf


def test_email_html_escapes_markup():
    # A catalog/agent-controlled string must never inject live markup into the export.
    payload = "<script>alert(1)</script> & <b>bold</b>"
    html = design_to_email_html({"pages": [{"nodes": [{"type": "text", "text": payload}]}]})
    # The raw tags do not survive...
    assert "<script>" not in html
    assert "<b>bold</b>" not in html
    # ...they are HTML-escaped instead.
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "&amp;" in html

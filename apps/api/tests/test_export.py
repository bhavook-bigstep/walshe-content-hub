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

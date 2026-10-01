"""Design -> email-ready HTML (AC12).

Escapes all text so a catalog/agent string can never inject markup, and emits only the design's
own content (Contract 2: nothing from the environment/keys leaks into the export).
"""
from __future__ import annotations

from html import escape
from typing import Any


def design_to_email_html(design: dict[str, Any]) -> str:
    """Render ``design`` to a single self-contained HTML string."""
    blocks: list[str] = []
    for page in design.get("pages") or []:
        parts = []
        for node in page.get("nodes", []):
            if node.get("type") == "text":
                parts.append(f"<p>{escape(str(node.get('text', '')))}</p>")
        blocks.append(f'<section>{"".join(parts)}</section>')
    body = "".join(blocks)
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "</head><body>"
        f"{body}"
        "</body></html>"
    )

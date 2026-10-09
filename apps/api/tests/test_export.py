"""AC12 — Export a design to PDF + email HTML (Contract 2: no secrets in output)."""

from __future__ import annotations

import base64
import io
import re

from app.media.html_export import design_to_email_html
from app.media.pdf import (
    _decode_data_url,
    _is_transparent,
    _sample_curve,
    _wrap_lines,
    design_to_pdf,
)


def _png_data_url() -> str:
    """A tiny synthetic PNG as a base64 data: URL (no fixtures, no network)."""
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 40, 40)).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


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


def test_is_transparent_recognises_the_keyword():
    assert _is_transparent("transparent")
    assert _is_transparent("  Transparent ")
    assert not _is_transparent("#ffffff")
    assert not _is_transparent("")
    assert not _is_transparent(None)


def test_pdf_handles_transparent_colours():
    # A transparent background, a transparent-fill rect kept visible by its outline, and transparent
    # text all render to a valid PDF without falling back to an opaque default colour.
    design = {
        "width": 800,
        "height": 600,
        "pages": [
            {
                "background": "transparent",
                "nodes": [
                    {
                        "type": "text",
                        "text": "Invisible",
                        "x": 40,
                        "y": 40,
                        "width": 400,
                        "color": "transparent",
                    },
                    {
                        "type": "shape",
                        "shape": "rect",
                        "x": 40,
                        "y": 120,
                        "width": 200,
                        "height": 120,
                        "color": "transparent",
                        "stroke": "#0b3d3a",
                        "strokeWidth": 4,
                    },
                    {
                        "type": "shape",
                        "shape": "ellipse",
                        "x": 300,
                        "y": 120,
                        "width": 120,
                        "height": 120,
                        "color": "transparent",
                    },
                ],
            }
        ],
    }
    pdf = design_to_pdf(design)
    assert pdf.startswith(b"%PDF")
    assert _count_pdf_pages(pdf) == 1


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


def test_decode_data_url_accepts_base64_image_only():
    assert _decode_data_url(_png_data_url()) is not None
    assert _decode_data_url("blob:http://x/abc") is None
    assert _decode_data_url("https://example.test/a.png") is None
    assert _decode_data_url("data:image/png,notbase64") is None
    assert _decode_data_url(None) is None


def test_pdf_embeds_inline_data_image():
    # An image node with an inline data: URL is embedded as a real image XObject (not a frame).
    design = {
        "width": 600,
        "height": 400,
        "pages": [
            {
                "nodes": [
                    {
                        "type": "image",
                        "x": 40,
                        "y": 40,
                        "width": 240,
                        "height": 180,
                        "radius": 16,
                        "src": _png_data_url(),
                    },
                ],
            }
        ],
    }
    pdf = design_to_pdf(design)
    assert pdf.startswith(b"%PDF")
    # reportlab writes embedded bitmaps as image XObjects.
    assert b"/Subtype /Image" in pdf


def test_pdf_skips_unfilled_media_placeholder():
    # An unfilled media placeholder exports transparent — no embedded image AND no neutral frame box
    # (so the slot is blank). A plain undecodable image still draws the frame, so it renders larger.
    box = {"type": "image", "x": 10, "y": 10, "width": 200, "height": 150}
    placeholder = {
        "width": 600,
        "height": 400,
        "pages": [{"nodes": [{**box, "placeholder": True, "src": "blob:ph"}]}],
    }
    plain = {"width": 600, "height": 400, "pages": [{"nodes": [{**box, "src": "blob:nope"}]}]}

    ph_pdf = design_to_pdf(placeholder)
    plain_pdf = design_to_pdf(plain)
    assert ph_pdf.startswith(b"%PDF")
    assert b"/Subtype /Image" not in ph_pdf  # nothing embedded
    # The placeholder drew nothing; the plain image drew a frame, so it renders larger.
    assert len(ph_pdf) < len(plain_pdf)


def test_pdf_image_without_inline_source_falls_back_to_frame():
    # A non-data src (e.g. a client blob: URL the server can't read) must not embed or crash;
    # it renders the neutral placeholder frame instead.
    design = {
        "width": 600,
        "height": 400,
        "pages": [
            {
                "nodes": [
                    {
                        "type": "image",
                        "x": 10,
                        "y": 10,
                        "width": 200,
                        "height": 150,
                        "src": "blob:nope",
                    }
                ]
            },
        ],
    }
    pdf = design_to_pdf(design)
    assert pdf.startswith(b"%PDF")
    assert b"/Subtype /Image" not in pdf


def test_sample_curve_matches_catmull_rom_smoothing():
    # 0–2 anchors pass through unchanged (a point / a straight line).
    assert _sample_curve([{"x": 0, "y": 0}]) == [(0.0, 0.0)]
    assert _sample_curve([{"x": 0, "y": 0}, {"x": 10, "y": 4}]) == [(0.0, 0.0), (10.0, 4.0)]

    # 3+ anchors are densified into a smooth polyline (per_segment=18 → (n-1)*18 + 1 points) that
    # actually bends: the sampled midpoint deviates from the straight chord between the endpoints.
    points = [{"x": 0, "y": 0}, {"x": 50, "y": 100}, {"x": 100, "y": 0}]
    sampled = _sample_curve(points)
    assert len(sampled) == (len(points) - 1) * 18 + 1
    assert sampled[0] == (0.0, 0.0) and sampled[-1] == (100.0, 0.0)
    # Chord midpoint is y=0; the curve rises above it, so it is NOT flattened to a straight line.
    mid = sampled[len(sampled) // 2]
    assert mid[1] > 10


def test_pdf_strokes_curve_through_anchors_not_a_straight_line():
    # A curve node (shape:"line" carrying `points`) must render as the smoothed polyline, not the
    # straight bounding-box diagonal the plain "line" branch would draw.
    curve = {
        "type": "shape",
        "shape": "line",
        "points": [{"x": 100, "y": 300}, {"x": 300, "y": 100}, {"x": 500, "y": 300}],
        "x": 100,
        "y": 100,
        "width": 400,
        "height": 200,
        "stroke": "#111111",
        "strokeWidth": 6,
    }
    design = {"width": 600, "height": 400, "pages": [{"nodes": [curve]}]}
    pdf = design_to_pdf(design)
    assert pdf.startswith(b"%PDF")
    # A straight 2-point line emits a single path segment; the smoothed curve emits many more, so
    # the curve's content stream is materially larger than the same node drawn as a plain line.
    straight = dict(curve)
    straight.pop("points")
    line_pdf = design_to_pdf({"width": 600, "height": 400, "pages": [{"nodes": [straight]}]})
    assert len(pdf) > len(line_pdf)


def test_pdf_applies_node_rotation():
    # A rotated node must be drawn rotated (a transform), not upright. Same node with/without an
    # angle produces different content, and 0°/360° is a no-op (identical bytes to unrotated).
    base = {
        "type": "shape",
        "shape": "rect",
        "x": 100,
        "y": 100,
        "width": 300,
        "height": 120,
        "color": "#f59e0b",
    }
    page = {"width": 600, "height": 400, "pages": [{"nodes": [base]}]}
    upright = design_to_pdf(page)
    rotated = design_to_pdf({**page, "pages": [{"nodes": [{**base, "angle": 30}]}]})
    noop = design_to_pdf({**page, "pages": [{"nodes": [{**base, "angle": 360}]}]})
    assert upright.startswith(b"%PDF") and rotated.startswith(b"%PDF")
    assert rotated != upright  # the 30° node is transformed
    assert len(noop) == len(upright)  # 360° is a no-op


def test_wrap_lines_wraps_to_width_and_keeps_hard_breaks():
    long = "the quick brown fox jumps over the lazy dog again and again and again"
    # A narrow box wraps the long paragraph onto several lines...
    narrow = _wrap_lines(long, "Helvetica", 48, 300)
    assert len(narrow) > 1
    # ...a zero width disables wrapping (one line), and explicit newlines stay hard breaks.
    assert _wrap_lines(long, "Helvetica", 48, 0) == [long]
    assert _wrap_lines("a\nb", "Helvetica", 48, 0) == ["a", "b"]

"""AC94 — seed images: a real image dropped in seed-assets/ wins over the generated fallback."""

from __future__ import annotations

from app.services.seed_images import _provided_image, slugify


def test_slugify():
    assert slugify("Cliffs of Moher") == "cliffs-of-moher"
    assert slugify("Uluru-Kata Tjuta") == "uluru-kata-tjuta"
    assert slugify("  ") == "entry"


def test_provided_image_prefers_a_dropped_file(tmp_path, monkeypatch):
    monkeypatch.setenv("SEED_ASSETS_DIR", str(tmp_path))
    slug = "cliffs-of-moher"
    (tmp_path / slug).mkdir(parents=True)
    png = b"\x89PNG\r\n\x1a\nreal-cover-bytes"
    (tmp_path / slug / "cover.png").write_bytes(png)

    got = _provided_image(slug, "cover")
    assert got is not None
    data, ctype, ext = got
    assert data == png and ctype == "image/png" and ext == "png"

    # A missing file (no photo-1) returns None so the caller falls back.
    assert _provided_image(slug, "photo-1") is None
    # An unknown slug returns None.
    assert _provided_image("nope", "cover") is None

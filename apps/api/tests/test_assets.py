"""AC4 — Upload an image for an entry; fetch it back (storage is the in-memory fake)."""
from __future__ import annotations

# A minimal, valid 1x1 PNG (synthetic bytes, no real asset).
PNG_1X1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082"
)


def _create_entry(client, provider_headers) -> int:
    resp = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "place", "title": "Pic Spot", "destination": "Clare"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_upload_then_fetch(client, provider_headers):
    entry_id = _create_entry(client, provider_headers)

    up = client.post(
        f"/catalog/{entry_id}/image",
        headers=provider_headers,
        files={"file": ("pic.png", PNG_1X1, "image/png")},
    )
    assert up.status_code == 201, up.text
    key = up.json()["object_key"]
    assert up.json()["content_type"] == "image/png"

    got = client.get(f"/assets/{key}")
    assert got.status_code == 200
    assert got.content == PNG_1X1
    assert got.headers["content-type"].startswith("image/png")

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

    got = client.get(f"/assets/{key}", headers=provider_headers)
    assert got.status_code == 200
    assert got.content == PNG_1X1
    assert got.headers["content-type"].startswith("image/png")


def _upload(client, provider_headers) -> tuple[int, str]:
    entry_id = _create_entry(client, provider_headers)
    up = client.post(
        f"/catalog/{entry_id}/image",
        headers=provider_headers,
        files={"file": ("pic.png", PNG_1X1, "image/png")},
    )
    assert up.status_code == 201, up.text
    return entry_id, up.json()["object_key"]


def test_asset_requires_auth(client, provider_headers):
    _, key = _upload(client, provider_headers)
    assert client.get(f"/assets/{key}").status_code == 401


def test_agent_cannot_fetch_hidden_asset(client, provider_headers, agent_headers):
    entry_id, key = _upload(client, provider_headers)
    # Draft + not brand-safe by default.
    assert client.get(f"/assets/{key}", headers=agent_headers).status_code == 404
    # Approved but not brand-safe is still hidden.
    client.patch(f"/catalog/{entry_id}", headers=provider_headers, json={"status": "approved"})
    assert client.get(f"/assets/{key}", headers=agent_headers).status_code == 404


def test_asset_path_traversal_rejected(client, app, provider_headers):
    from sqlalchemy import select

    from app.models.user import User
    from app.services.visibility import visible_asset_or_none

    _, key = _upload(client, provider_headers)
    # Over HTTP (the client may normalise raw dot-segments, so use encoded forms).
    for bad in ("%2e%2e/secret", "..%5csecret", "entries/%2e%2e/1/pic.png"):
        assert client.get(f"/assets/{bad}", headers=provider_headers).status_code == 404
    assert client.get("/assets//etc/passwd", headers=provider_headers).status_code == 404
    # Direct choke-point check: traversal is refused even if the key would otherwise resolve.
    with app.state.sessionmaker() as db:
        owner = db.execute(select(User).where(User.email == "provider@test.local")).scalar_one()
        assert visible_asset_or_none(db, owner, key) is not None
        for bad in ("entries/../" + key, "/" + key, key.replace("/", "\\")):
            assert visible_asset_or_none(db, owner, bad) is None


def test_agent_fetches_visible_asset(client, provider_headers, agent_headers):
    entry_id, key = _upload(client, provider_headers)
    patched = client.patch(
        f"/catalog/{entry_id}",
        headers=provider_headers,
        json={"status": "approved", "brand_safe": True},
    )
    assert patched.status_code == 200, patched.text
    got = client.get(f"/assets/{key}", headers=agent_headers)
    assert got.status_code == 200
    assert got.content == PNG_1X1

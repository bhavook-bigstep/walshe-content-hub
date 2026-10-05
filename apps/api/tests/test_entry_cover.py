"""AC52 — entry cover photo: upload or AI-generate, served through the asset gate."""

from __future__ import annotations

PNG = b"\x89PNG\r\n\x1a\nsynthetic-cover"


def _public_catalog(client, provider_headers) -> int:
    created = client.post(
        "/catalogs", headers=provider_headers, json={"name": "Covers", "category": "events"}
    )
    assert created.status_code == 201, created.text
    cid = created.json()["id"]
    assert client.patch(
        f"/catalogs/{cid}", headers=provider_headers, json={"visibility": "public"}
    ).status_code == 200
    return cid


def _entry(
    client, provider_headers, catalog_id: int, title: str = "Cover me", visibility: str = "public"
) -> int:
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={
            "catalog_id": catalog_id,
            "type": "place",
            "title": title,
            "description": "d",
            "destination": "Clare",
            "visibility": visibility,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_upload_cover_sets_key_and_is_served_to_a_visible_agent(
    client, provider_headers, agent_headers
):
    cid = _public_catalog(client, provider_headers)
    eid = _entry(client, provider_headers, cid)

    up = client.post(
        f"/catalog/{eid}/cover",
        headers=provider_headers,
        files={"file": ("cover.png", PNG, "image/png")},
    )
    assert up.status_code == 201, up.text
    key = up.json()["cover_object_key"]
    assert key.startswith(f"entries/{eid}/cover/")

    # The cover surfaces on the entry for both roles.
    got = client.get(f"/catalog/{eid}", headers=provider_headers).json()
    assert got["cover_object_key"] == key

    # An agent who can see the (public) catalog can fetch the cover bytes.
    served = client.get(f"/assets/{key}", headers=agent_headers)
    assert served.status_code == 200 and served.content == PNG


def test_generate_cover_sets_key_deterministically(client, provider_headers):
    cid = _public_catalog(client, provider_headers)
    eid = _entry(client, provider_headers, cid)

    gen = client.post(
        f"/catalog/{eid}/cover/generate", headers=provider_headers, json={"prompt": "a lighthouse"}
    )
    assert gen.status_code == 201, gen.text
    key = gen.json()["cover_object_key"]
    body = client.get(f"/assets/{key}", headers=provider_headers)
    assert body.status_code == 200 and body.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_cover_upload_rejects_unsupported_type_and_guards_ownership(client, provider_headers):
    cid = _public_catalog(client, provider_headers)
    eid = _entry(client, provider_headers, cid)

    # SVG (active markup) is refused at the boundary.
    bad = client.post(
        f"/catalog/{eid}/cover",
        headers=provider_headers,
        files={"file": ("x.svg", b"<svg/>", "image/svg+xml")},
    )
    assert bad.status_code == 415

    # A non-existent / non-owned entry is a 404 (not found == not yours).
    missing = client.post(
        "/catalog/999999/cover",
        headers=provider_headers,
        files={"file": ("cover.png", PNG, "image/png")},
    )
    assert missing.status_code == 404


def test_cover_hidden_from_an_agent_without_catalog_access(client, provider_headers, agent_headers):
    # A PRIVATE catalog's entry cover must not be fetchable by an unshared agent.
    created = client.post(
        "/catalogs", headers=provider_headers, json={"name": "Private", "category": "events"}
    )
    cid = created.json()["id"]
    eid = _entry(client, provider_headers, cid, title="Secret", visibility="private")
    up = client.post(
        f"/catalog/{eid}/cover",
        headers=provider_headers,
        files={"file": ("cover.png", PNG, "image/png")},
    )
    key = up.json()["cover_object_key"]
    assert client.get(f"/assets/{key}", headers=agent_headers).status_code == 404

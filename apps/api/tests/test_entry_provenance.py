"""AC56 — each entry records who created it and which org it belongs to."""

from __future__ import annotations


def test_entry_records_creator_and_org(client, provider_headers):
    cid = client.post(
        "/catalogs", headers=provider_headers, json={"name": "Prov"}
    ).json()["id"]
    out = client.post(
        "/catalog",
        headers=provider_headers,
        json={
            "catalog_id": cid,
            "type": "event",
            "title": "Provenance test",
            "description": "d",
            "destination": "Galway",
            "visibility": "public",
        },
    ).json()
    # The creator (from the token) + their org (the conftest tenant) are snapshotted on the entry.
    assert out["created_by_email"] == "provider@test.local"
    assert out["org_name"] == "Test Tourism Board"

    # Provenance persists on subsequent reads.
    got = client.get(f"/catalog/{out['id']}", headers=provider_headers).json()
    assert got["created_by_email"] == "provider@test.local"
    assert got["org_name"] == "Test Tourism Board"

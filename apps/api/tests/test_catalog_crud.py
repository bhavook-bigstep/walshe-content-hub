"""AC3 — Provider creates catalog entries of every type."""
from __future__ import annotations

from app.models.catalog import CatalogType

ALL_TYPES = [t.value for t in CatalogType]


def test_create_entry_each_type(client, provider_headers):
    # One entry of every catalog type (event / place / opportunity / offer / itinerary).
    for entry_type in ALL_TYPES:
        resp = client.post(
            "/catalog",
            headers=provider_headers,
            json={
                "type": entry_type,
                "title": f"Entry {entry_type}",
                "description": "desc",
                "destination": "Galway",
                "market_tags": ["leisure"],
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["type"] == entry_type
        assert body["status"] == "draft"  # not distributable until approved (AC6)


def test_invalid_type_is_rejected(client, provider_headers):
    resp = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "banana", "title": "x", "destination": "Galway"},
    )
    assert resp.status_code == 422

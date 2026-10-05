"""Agent workspace features (AC28): saved projects, collections, brand kit, templates."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_projects_crud(
    client: TestClient, agent_headers: dict[str, str], provider_headers: dict[str, str]
) -> None:
    created = client.post(
        "/me/projects",
        headers=agent_headers,
        json={"name": "My post", "format": "social", "item_ids": [1, 2], "design": {"nodes": []}},
    )
    assert created.status_code == 201, created.text
    pid = created.json()["id"]
    assert created.json()["name"] == "My post"

    assert any(p["id"] == pid for p in client.get("/me/projects", headers=agent_headers).json())

    renamed = client.put(f"/me/projects/{pid}", headers=agent_headers, json={"name": "Renamed"})
    assert renamed.status_code == 200 and renamed.json()["name"] == "Renamed"

    assert client.delete(f"/me/projects/{pid}", headers=agent_headers).status_code == 204
    # Agent-only.
    assert client.get("/me/projects", headers=provider_headers).status_code == 403


def _visible_entry(client, provider_headers, title: str) -> int:
    cid = client.post("/catalogs", headers=provider_headers, json={"name": "C"}).json()["id"]
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={
            "catalog_id": cid, "type": "event", "title": title, "description": "d",
            "destination": "Galway", "visibility": "public",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_collections_crud(client, provider_headers, agent_headers) -> None:
    # AC59/AC60 — a collection stores validated entry references and resolves against the catalog.
    e1 = _visible_entry(client, provider_headers, "Saveable one")
    e2 = _visible_entry(client, provider_headers, "Saveable two")

    # Create with a mix of a visible entry + a bogus id → only the visible one is kept.
    created = client.post(
        "/me/collections",
        headers=agent_headers,
        json={"name": "West coast", "item_ids": [e1, 999999]},
    )
    assert created.status_code == 201, created.text
    cid = created.json()["id"]
    assert created.json()["item_ids"] == [e1]

    # Save a second visible entry via the add endpoint; a bogus id is rejected.
    add = client.post(f"/me/collections/{cid}/items", headers=agent_headers, json={"entry_id": e2})
    assert add.status_code == 200 and set(add.json()["item_ids"]) == {e1, e2}
    assert client.post(
        f"/me/collections/{cid}/items", headers=agent_headers, json={"entry_id": 999999}
    ).status_code == 404

    # Resolve → both entries present, nothing dropped.
    resolved = client.get(f"/me/collections/{cid}/resolved", headers=agent_headers).json()
    assert {i["id"] for i in resolved["items"]} == {e1, e2}
    assert resolved["dropped_item_ids"] == []

    # Remove one item.
    rem = client.delete(f"/me/collections/{cid}/items/{e1}", headers=agent_headers)
    assert rem.status_code == 200 and rem.json()["item_ids"] == [e2]

    assert client.delete(f"/me/collections/{cid}", headers=agent_headers).status_code == 204
    assert all(c["id"] != cid for c in client.get("/me/collections", headers=agent_headers).json())


def test_collection_drops_expired_references(client, provider_headers, agent_headers, app) -> None:
    # AC60 — an entry that expires after being saved is dropped from the resolved view.
    from datetime import datetime, timezone

    from app.models.catalog import CatalogEntry

    eid = _visible_entry(client, provider_headers, "Will expire")
    cid = client.post(
        "/me/collections", headers=agent_headers, json={"name": "Timely", "item_ids": [eid]}
    ).json()["id"]
    assert client.get(f"/me/collections/{cid}/resolved", headers=agent_headers).json()["items"]

    with app.state.sessionmaker() as db:
        db.get(CatalogEntry, eid).expires_at = datetime(2000, 1, 1, tzinfo=timezone.utc)
        db.commit()

    resolved = client.get(f"/me/collections/{cid}/resolved", headers=agent_headers).json()
    assert resolved["items"] == [] and resolved["dropped_item_ids"] == [eid]


def test_brand_kit_and_templates(client: TestClient, agent_headers: dict[str, str]) -> None:
    kit = client.get("/me/brand-kit", headers=agent_headers)
    assert kit.status_code == 200, kit.text

    updated = client.put(
        "/me/brand-kit",
        headers=agent_headers,
        json={"primary_color": "#123456", "contact_name": "Alex"},
    )
    assert updated.status_code == 200
    assert updated.json()["primary_color"] == "#123456"
    assert updated.json()["contact_name"] == "Alex"

    templates = client.get("/me/design-templates", headers=agent_headers)
    assert templates.status_code == 200
    assert len(templates.json()) >= 1
    assert {"id", "name", "format", "description"} <= set(templates.json()[0].keys())

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


def test_project_from_collection_seeds_workspace(client, provider_headers, agent_headers) -> None:
    # AC75 — creating a project from a collection seeds reference_content.collections,
    # and GET /workspace returns it resolved (collection entries with their items).
    e1 = _visible_entry(client, provider_headers, "WS one")
    e2 = _visible_entry(client, provider_headers, "WS two")
    cid = client.post(
        "/me/collections", headers=agent_headers,
        json={"name": "Trip", "item_ids": [e1, e2]},
    ).json()["id"]

    created = client.post(
        "/me/projects", headers=agent_headers,
        json={"name": "From trip", "format": "story", "collection_id": cid},
    )
    assert created.status_code == 201, created.text
    pid = created.json()["id"]
    assert sorted(created.json()["item_ids"]) == sorted([e1, e2])

    ws = client.get(f"/me/projects/{pid}/workspace", headers=agent_headers)
    assert ws.status_code == 200, ws.text
    body = ws.json()
    assert body["metadata"]["format"] == "story"
    assert body["metadata"]["width"] == 1080 and body["metadata"]["height"] == 1920
    assert len(body["reference_content"]["collections"]) == 1
    coll = body["reference_content"]["collections"][0]
    assert coll["collection_id"] == cid
    assert {e["id"] for e in coll["entries"]} == {e1, e2}


def test_workspace_refs_carry_media_links(client, provider_headers, agent_headers, app) -> None:
    # AC75 — the stored reference_content entries carry the entry's media links (S3/MinIO keys),
    # so the workspace is self-contained. We inspect the persisted workspace JSON directly.
    from app.models.composition import Composition

    eid = _visible_entry(client, provider_headers, "Has media")
    # Attach a cover object key to the entry (a reference/pointer, not bytes).
    with app.state.sessionmaker() as db:
        from app.models.catalog import CatalogEntry

        db.get(CatalogEntry, eid).cover_object_key = "catalog/has-media/cover.png"
        db.commit()

    cid = client.post(
        "/me/collections", headers=agent_headers, json={"name": "Media", "item_ids": [eid]}
    ).json()["id"]
    pid = client.post(
        "/me/projects", headers=agent_headers,
        json={"name": "Media proj", "collection_id": cid},
    ).json()["id"]

    with app.state.sessionmaker() as db:
        rc = db.get(Composition, pid).workspace["reference_content"]
        ref = rc["collections"][0]["entries"][0]
    assert ref["entry_id"] == eid
    assert ref["cover_object_key"] == "catalog/has-media/cover.png"
    assert "media_keys" in ref


def test_workspace_put_validates_and_bumps_version(client, provider_headers, agent_headers) -> None:
    # AC75 — PUT saves the whole workspace, bumps the version, and drops invalid references.
    e1 = _visible_entry(client, provider_headers, "Keep me")
    pid = client.post(
        "/me/projects", headers=agent_headers, json={"name": "Blank", "format": "social"}
    ).json()["id"]

    put = client.put(
        f"/me/projects/{pid}/workspace", headers=agent_headers,
        json={
            "metadata": {"name": "Edited", "format": "social", "width": 1080, "height": 1080},
            "reference_content": {
                "collections": [{
                    "collection_id": 0, "name": "Picks",
                    "entries": [
                        {"entry_id": e1, "title": "Keep me", "type": "event"},
                        {"entry_id": 999999, "title": "Ghost", "type": "event"},
                    ],
                }],
                "uploads": [{"asset_id": 123456, "object_key": "nope"}],
                "generated": [],
            },
            "scenes": [{"id": "s1", "nodes": []}],
        },
    )
    assert put.status_code == 200, put.text
    body = put.json()
    # Version bumped from the seeded 1 to 2.
    assert body["metadata"]["version"] == 2
    # Non-visible entry and non-owned asset dropped; the valid one stays.
    coll = body["reference_content"]["collections"][0]
    assert {e["id"] for e in coll["entries"]} == {e1}
    assert body["reference_content"]["uploads"] == []
    assert body["scenes"] == [{"id": "s1", "nodes": []}]

    # item_ids stays synced for the compat resolve path.
    assert client.get(f"/me/projects/{pid}", headers=agent_headers).json()["item_ids"] == [e1]


def test_workspace_migrates_legacy_project(client, agent_headers, app) -> None:
    # AC75 — a project saved before workspaces migrates on read from its item_ids/design.
    from app.models.composition import Composition

    pid = client.post(
        "/me/projects", headers=agent_headers,
        json={"name": "Legacy", "format": "pamphlet", "design": {"scenes": [{"id": "old"}]}},
    ).json()["id"]

    # Simulate a pre-workspace project: wipe the seeded workspace, set a legacy item_id.
    with app.state.sessionmaker() as db:
        legacy = db.get(Composition, pid)
        legacy.workspace = {}
        legacy.item_ids = [7]
        db.commit()

    ws = client.get(f"/me/projects/{pid}/workspace", headers=agent_headers)
    assert ws.status_code == 200, ws.text
    body = ws.json()
    assert body["metadata"]["format"] == "pamphlet"
    assert body["metadata"]["width"] == 1240 and body["metadata"]["height"] == 1754
    assert body["scenes"] == [{"id": "old"}]


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

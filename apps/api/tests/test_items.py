"""AC50 — entries decompose into first-class text/media items; catalog-gated browse."""

from __future__ import annotations

from sqlalchemy import select

from app.models.catalog import CatalogEntry, CatalogType, ItemKind
from app.models.user import Role, User
from app.services.catalog_migration import decompose_entries_to_items

PNG = b"\x89PNG\r\n\x1a\nsynthetic"


def _catalog(client, provider_headers, visibility: str) -> int:
    body = {"name": "C", "visibility": visibility}
    return client.post("/catalogs", headers=provider_headers, json=body).json()["id"]


def _entry(client, provider_headers, catalog_id: int) -> int:
    body = {
        "catalog_id": catalog_id, "type": "event", "title": "Harbour Festival",
        "description": "By the sea", "destination": "Galway",
    }
    return client.post("/catalog", headers=provider_headers, json=body).json()["id"]


def test_entry_items_crud_browse_and_serving(client, provider_headers, agent_headers):
    cid = _catalog(client, provider_headers, "public")
    eid = _entry(client, provider_headers, cid)

    text = client.post(
        f"/catalog/{eid}/items/text", headers=provider_headers,
        json={"text": "Join us", "title": "Tagline"},
    )
    assert text.status_code == 201 and text.json()["kind"] == "text"

    img = client.post(
        f"/catalog/{eid}/items/media", headers=provider_headers,
        files={"file": ("a.png", PNG, "image/png")}, data={"title": "Poster"},
    )
    assert img.status_code == 201 and img.json()["kind"] == "image"
    vid = client.post(
        f"/catalog/{eid}/items/media", headers=provider_headers,
        files={"file": ("a.mp4", b"\x00\x00", "video/mp4")},
    )
    assert vid.status_code == 201 and vid.json()["kind"] == "video"
    bad = client.post(
        f"/catalog/{eid}/items/media", headers=provider_headers,
        files={"file": ("a.svg", b"<svg/>", "image/svg+xml")},
    )
    assert bad.status_code == 415  # active-markup type refused (Contract 2)

    items = client.get(f"/catalog/{eid}/items", headers=provider_headers).json()
    assert len(items) == 3

    # An agent browses the public catalog → entries carry their items, and can fetch the image.
    entries = client.get(f"/catalogs/{cid}/entries", headers=agent_headers).json()
    assert entries and entries[0]["id"] == eid and len(entries[0]["items"]) == 3
    key = next(i["object_key"] for i in items if i["kind"] == "image")
    assert client.get(f"/assets/{key}", headers=agent_headers).status_code == 200

    deleted = client.delete(f"/catalog/{eid}/items/{text.json()['id']}", headers=provider_headers)
    assert deleted.status_code == 204
    assert len(client.get(f"/catalog/{eid}/items", headers=provider_headers).json()) == 2


def test_private_catalog_browse_hidden_from_unshared_agent(client, provider_headers, agent_headers):
    cid = _catalog(client, provider_headers, "private")
    _entry(client, provider_headers, cid)
    assert client.get(f"/catalogs/{cid}/entries", headers=agent_headers).status_code == 404


def test_private_catalog_item_media_gated_by_sharing(client, provider_headers, agent_headers, app):
    cid = _catalog(client, provider_headers, "private")
    eid = _entry(client, provider_headers, cid)
    key = client.post(
        f"/catalog/{eid}/items/media", headers=provider_headers,
        files={"file": ("a.png", PNG, "image/png")},
    ).json()["object_key"]

    # An unshared agent cannot fetch the private catalog's item media (Contract 1 leak path).
    assert client.get(f"/assets/{key}", headers=agent_headers).status_code == 404

    agent_id = db_agent_id(app)
    client.put(
        f"/catalogs/{cid}/share", headers=provider_headers, json={"shared_agent_ids": [agent_id]}
    )
    assert client.get(f"/assets/{key}", headers=agent_headers).status_code == 200  # now shared


def db_agent_id(app) -> int:
    with app.state.sessionmaker() as db:
        return db.execute(select(User.id).where(User.role == Role.tourism_agent)).scalars().first()


def test_decompose_entries_to_items(app):
    with app.state.sessionmaker() as db:
        provider_id = db.execute(
            select(User.id).where(User.role == Role.content_provider)
        ).scalars().first()
        entry = CatalogEntry(
            type=CatalogType.event, title="T", description="D", destination="Galway",
            provider_id=provider_id, custom_sections=[{"title": "Sec", "body": "B"}],
        )
        db.add(entry)
        db.commit()
        eid = entry.id

        assert decompose_entries_to_items(db) >= 1
        assert decompose_entries_to_items(db) == 0  # idempotent — entry now has items

        e = db.get(CatalogEntry, eid)
        texts = [i for i in e.items if i.kind == ItemKind.text]
        assert [i.text for i in texts] == ["T", "D", "B"]  # title, description, section body

"""AC49 — catalog library + catalog-level access (re-bases Contract 1 / AC6 to catalog-gating)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from app.models.catalog import Catalog, CatalogEntry, CatalogType, CatalogVisibility, EntryStatus
from app.models.user import Role, User
from app.services.catalog_migration import migrate_entries_to_catalogs


def _agent_id(app) -> int:
    with app.state.sessionmaker() as db:
        return db.execute(select(User.id).where(User.role == Role.tourism_agent)).scalars().first()


def _make_entry(
    client, provider_headers, catalog_id: int, title: str, visibility: str = "public"
) -> int:
    body = {
        "catalog_id": catalog_id,
        "type": "event",
        "title": title,
        "description": "d",
        "destination": "Galway",
        "visibility": visibility,
    }
    r = client.post("/catalog", headers=provider_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _agent_sees(client, agent_headers, entry_id: int) -> bool:
    rows = client.get("/catalog", headers=agent_headers).json()
    return any(e["id"] == entry_id for e in rows)


# AC49.1/49.3 — provider CRUD + share.
def test_catalog_crud_and_share(client, provider_headers, admin_headers, app):
    created = client.post(
        "/catalogs", headers=provider_headers, json={"name": "Events", "category": "events"}
    )
    assert created.status_code == 201, created.text
    cat = created.json()
    assert cat["visibility"] == "private" and cat["entry_count"] == 0

    own = client.get("/catalogs", headers=provider_headers).json()
    assert [c["id"] for c in own] == [cat["id"]]

    upd = client.patch(
        f"/catalogs/{cat['id']}", headers=provider_headers, json={"visibility": "public"}
    )
    assert upd.status_code == 200 and upd.json()["visibility"] == "public"

    # Sharing keeps only real agent ids.
    agent_id = _agent_id(app)
    shared = client.put(
        f"/catalogs/{cat['id']}/share",
        headers=provider_headers,
        json={"shared_agent_ids": [agent_id, 9999]},
    )
    assert shared.status_code == 200 and shared.json()["shared_agent_ids"] == [agent_id]

    # A provider cannot touch another role's / unknown catalog.
    missing = client.patch("/catalogs/9999", headers=provider_headers, json={"name": "x"})
    assert missing.status_code == 404
    assert client.post("/catalogs", headers=admin_headers, json={"name": "no"}).status_code == 403


# AC49.2 — catalog-level gating: public visible to all; private only to shared agents.
def test_catalog_gating(client, provider_headers, agent_headers, app):
    # AC54 — per-entry visibility is the gate: public reaches everyone, private only invited
    # agents, draft nobody. The catalog holds the invited-agents list.
    agent_id = _agent_id(app)
    cat = client.post(
        "/catalogs", headers=provider_headers, json={"name": "Board"}
    ).json()

    # A PUBLIC entry is visible to any agent.
    pub_entry = _make_entry(client, provider_headers, cat["id"], "Public Festival", "public")
    assert _agent_sees(client, agent_headers, pub_entry)

    # A DRAFT entry reaches no agent.
    draft_entry = _make_entry(client, provider_headers, cat["id"], "Work in progress", "draft")
    assert not _agent_sees(client, agent_headers, draft_entry)

    # A PRIVATE entry is hidden until the agent is invited on the catalog.
    priv_entry = _make_entry(client, provider_headers, cat["id"], "Secret Gala", "private")
    assert not _agent_sees(client, agent_headers, priv_entry)

    client.put(
        f"/catalogs/{cat['id']}/share",
        headers=provider_headers,
        json={"shared_agent_ids": [agent_id]},
    )
    assert _agent_sees(client, agent_headers, priv_entry)

    # The catalog is accessible (has a public entry); it drops off only when nothing is visible.
    accessible = {c["id"] for c in client.get("/catalogs/accessible", headers=agent_headers).json()}
    assert cat["id"] in accessible


# AC49 × AC55 — an expired entry stays in an accessible catalog, but is marked expired (greyed).
def test_expired_entry_in_public_catalog_is_shown_greyed(
    client, provider_headers, agent_headers, app
):
    cid = client.post(
        "/catalogs", headers=provider_headers, json={"name": "P", "visibility": "public"}
    ).json()["id"]
    eid = _make_entry(client, provider_headers, cid, "Expired Festival")
    assert _agent_sees(client, agent_headers, eid)  # visible while unexpired

    with app.state.sessionmaker() as db:
        entry = db.get(CatalogEntry, eid)
        entry.expires_at = datetime(2000, 1, 1, tzinfo=timezone.utc)
        db.commit()
    # Still present, now flagged expired so the UI can grey it (AC55).
    row = next(
        (e for e in client.get("/catalog", headers=agent_headers).json() if e["id"] == eid), None
    )
    assert row is not None and row["display_status"] == "expired"


# AC49.4 — deterministic, idempotent migration of catalog-less entries.
def test_migrate_entries_to_catalogs(app):
    with app.state.sessionmaker() as db:
        provider_id = db.execute(
            select(User.id).where(User.role == Role.content_provider)
        ).scalars().first()
        approved = CatalogEntry(
            type=CatalogType.event, title="Approved", description="", destination="Galway",
            status=EntryStatus.approved, brand_safe=True, provider_id=provider_id,
        )
        draft = CatalogEntry(
            type=CatalogType.event, title="Draft", description="", destination="Galway",
            status=EntryStatus.draft, brand_safe=False, provider_id=provider_id,
        )
        db.add_all([approved, draft])
        db.commit()
        approved_id, draft_id = approved.id, draft.id

        moved = migrate_entries_to_catalogs(db)
        assert moved == 2
        assert migrate_entries_to_catalogs(db) == 0  # idempotent

        a = db.get(CatalogEntry, approved_id)
        d = db.get(CatalogEntry, draft_id)
        assert a.catalog.visibility == CatalogVisibility.public and a.catalog.name == "Imported"
        assert d.catalog.visibility == CatalogVisibility.private and d.catalog.name == "Drafts"
        # One Imported + one Drafts catalog for the provider (not one per entry).
        cats = db.execute(select(Catalog).where(Catalog.provider_id == provider_id)).scalars().all()
        assert sorted(c.name for c in cats) == ["Drafts", "Imported"]

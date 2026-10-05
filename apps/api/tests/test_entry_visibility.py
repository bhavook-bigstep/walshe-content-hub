"""AC54 — per-entry visibility: draft (default) · public · private (invited agents)."""

from __future__ import annotations

from sqlalchemy import select

from app.models.user import Role, User


def _agent_id(app) -> int:
    with app.state.sessionmaker() as db:
        return db.execute(select(User.id).where(User.role == Role.tourism_agent)).scalars().first()


def _catalog(client, provider_headers) -> int:
    return client.post("/catalogs", headers=provider_headers, json={"name": "Board"}).json()["id"]


def _entry(client, provider_headers, cid, title, visibility=None):
    body = {"catalog_id": cid, "type": "event", "title": title, "description": "d",
            "destination": "Galway"}
    if visibility is not None:
        body["visibility"] = visibility
    r = client.post("/catalog", headers=provider_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _agent_feed_ids(client, agent_headers) -> set[int]:
    return {e["id"] for e in client.get("/catalog", headers=agent_headers).json()}


def test_entry_defaults_to_draft_and_is_hidden(client, provider_headers, agent_headers):
    cid = _catalog(client, provider_headers)
    out = _entry(client, provider_headers, cid, "Untouched")  # no visibility given
    assert out["visibility"] == "draft"
    assert out["id"] not in _agent_feed_ids(client, agent_headers)


def test_public_entry_reaches_every_agent(client, provider_headers, agent_headers):
    cid = _catalog(client, provider_headers)
    out = _entry(client, provider_headers, cid, "Open", "public")
    assert out["id"] in _agent_feed_ids(client, agent_headers)


def test_private_entry_only_for_invited_agents(client, provider_headers, agent_headers, app):
    cid = _catalog(client, provider_headers)
    out = _entry(client, provider_headers, cid, "Invite only", "private")
    assert out["id"] not in _agent_feed_ids(client, agent_headers)

    client.put(
        f"/catalogs/{cid}/share", headers=provider_headers,
        json={"shared_agent_ids": [_agent_id(app)]},
    )
    assert out["id"] in _agent_feed_ids(client, agent_headers)


def test_invite_agent_by_email_grants_private_access(client, provider_headers, agent_headers):
    cid = _catalog(client, provider_headers)
    out = _entry(client, provider_headers, cid, "Invite only", "private")
    assert out["id"] not in _agent_feed_ids(client, agent_headers)

    # Invite by email (case-insensitive) → resolved agent shows up, and the private entry appears.
    inv = client.post(
        "/catalogs/mine/invite", headers=provider_headers, json={"email": "Agent@Test.Local"}
    )
    assert inv.status_code == 200, inv.text
    assert [a["email"] for a in inv.json()["invited_agents"]] == ["agent@test.local"]
    assert out["id"] in _agent_feed_ids(client, agent_headers)

    agent_id = inv.json()["invited_agents"][0]["id"]
    rem = client.delete(f"/catalogs/mine/invite/{agent_id}", headers=provider_headers)
    assert rem.status_code == 200 and rem.json()["invited_agents"] == []
    assert out["id"] not in _agent_feed_ids(client, agent_headers)


def test_invite_rejects_unknown_or_non_agent_email(client, provider_headers):
    # Nobody with that email.
    assert client.post(
        "/catalogs/mine/invite", headers=provider_headers, json={"email": "nobody@example.test"}
    ).status_code == 404
    # A real user who is not a tourism agent (the provider themselves).
    assert client.post(
        "/catalogs/mine/invite", headers=provider_headers, json={"email": "provider@test.local"}
    ).status_code == 404


def test_set_access_moves_entry_between_sets_and_audits_unpublish(
    client, provider_headers, agent_headers, admin_headers
):
    cid = _catalog(client, provider_headers)
    out = _entry(client, provider_headers, cid, "Movable", "public")
    eid = out["id"]
    assert eid in _agent_feed_ids(client, agent_headers)

    # Pull it back to draft → hidden, and the unpublish is traceable (Contract 3).
    patched = client.patch(
        f"/catalog/{eid}", headers=provider_headers, json={"visibility": "draft"}
    )
    assert patched.status_code == 200 and patched.json()["visibility"] == "draft"
    assert eid not in _agent_feed_ids(client, agent_headers)

    audit = client.get("/audit", headers=admin_headers).json()
    assert any(
        row["action"] == "unpublish" and row["target_id"] == eid for row in audit
    ), audit

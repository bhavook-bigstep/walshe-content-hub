"""AC36 — off-limits blocklist enforced at the visibility choke-point (FR-08). Hermetic."""

from __future__ import annotations

from datetime import datetime, timezone

from app import clock

T0 = datetime(2026, 6, 1, tzinfo=timezone.utc)


def _fix_clock(app, instant: datetime) -> None:
    app.dependency_overrides[clock.now] = lambda: instant


def _approved_entry(client, provider_headers, *, title: str, destination: str) -> int:
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "place", "title": title, "destination": destination},
    )
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    r = client.patch(
        f"/catalog/{entry_id}",
        headers=provider_headers,
        json={"status": "approved", "brand_safe": True},
    )
    assert r.status_code == 200, r.text
    return entry_id


def test_blocked_term_hides_entry_from_agent_catalog_and_search(
    client, provider_headers, agent_headers, app
):
    _fix_clock(app, T0)
    entry_id = _approved_entry(client, provider_headers, title="Harbour Walk", destination="Galway")

    # Visible before any blocklist term.
    assert any(e["id"] == entry_id for e in client.get("/catalog", headers=agent_headers).json())

    # A board flags the destination off-limits.
    r = client.post("/blocklist", headers=provider_headers, json={"term": "Galway"})
    assert r.status_code == 201, r.text

    # Now gone from list, search and direct GET — and from drafting (builder by-ids).
    assert all(e["id"] != entry_id for e in client.get("/catalog", headers=agent_headers).json())
    assert all(
        e["id"] != entry_id for e in client.get("/catalog?q=Harbour", headers=agent_headers).json()
    )
    assert client.get(f"/catalog/{entry_id}", headers=agent_headers).status_code == 404
    assert (
        client.post(
            "/builder/design",
            headers=agent_headers,
            json={"prompt": "promote it", "item_ids": [entry_id]},
        ).status_code
        == 404
    )


def test_blocklist_crud_is_board_scoped_and_audited(
    client, provider_headers, agent_headers, admin_headers
):
    # Agents cannot see or manage the blocklist.
    assert client.get("/blocklist", headers=agent_headers).status_code == 403
    assert client.post("/blocklist", headers=agent_headers, json={"term": "x"}).status_code == 403

    # Provider adds a term; it is trimmed + lower-cased and idempotent.
    r = client.post("/blocklist", headers=provider_headers, json={"term": "  Volcano  "})
    assert r.status_code == 201, r.text
    term_id = r.json()["id"]
    assert r.json()["term"] == "volcano"
    assert (
        client.post("/blocklist", headers=provider_headers, json={"term": "volcano"}).json()["id"]
        == term_id
    )

    # Add + remove are both audited (Contract 3).
    assert any(
        a["action"] == "blocklist_add" for a in client.get("/audit", headers=admin_headers).json()
    )
    assert client.delete(f"/blocklist/{term_id}", headers=provider_headers).status_code == 204
    assert all(
        t["id"] != term_id for t in client.get("/blocklist", headers=provider_headers).json()
    )
    assert any(
        a["action"] == "blocklist_remove"
        for a in client.get("/audit", headers=admin_headers).json()
    )


def test_blocked_term_matches_structured_fields(client, provider_headers, agent_headers, app):
    """An off-limits term hidden only in a highlight (not title/destination) still hides it."""
    _fix_clock(app, T0)
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={
            "type": "place",
            "title": "Coastal Trail",
            "destination": "Kerry",
            "highlights": ["Guided Volcano hike at dawn"],
        },
    )
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    client.patch(
        f"/catalog/{entry_id}",
        headers=provider_headers,
        json={"status": "approved", "brand_safe": True},
    )
    assert client.get(f"/catalog/{entry_id}", headers=agent_headers).status_code == 200

    client.post("/blocklist", headers=provider_headers, json={"term": "volcano"})
    assert client.get(f"/catalog/{entry_id}", headers=agent_headers).status_code == 404


def test_removing_a_term_restores_agent_visibility(client, provider_headers, agent_headers, app):
    """Deleting an off-limits term brings the matching entry back for agents."""
    _fix_clock(app, T0)
    entry_id = _approved_entry(
        client, provider_headers, title="Dockside Fair", destination="Galway"
    )
    added = client.post("/blocklist", headers=provider_headers, json={"term": "Galway"})
    assert added.status_code == 201
    assert client.get(f"/catalog/{entry_id}", headers=agent_headers).status_code == 404

    assert (
        client.delete(f"/blocklist/{added.json()['id']}", headers=provider_headers).status_code
        == 204
    )
    assert client.get(f"/catalog/{entry_id}", headers=agent_headers).status_code == 200


def test_blocklist_rejects_short_terms_and_guards_delete(client, provider_headers, agent_headers):
    """Terms must be >= 3 chars; agents cannot delete; unknown ids are 404."""
    assert (
        client.post("/blocklist", headers=provider_headers, json={"term": "ab"}).status_code == 422
    )
    assert (
        client.post("/blocklist", headers=provider_headers, json={"term": "   "}).status_code == 422
    )

    created = client.post("/blocklist", headers=provider_headers, json={"term": "testlimit"})
    assert created.status_code == 201
    term_id = created.json()["id"]

    assert client.delete(f"/blocklist/{term_id}", headers=agent_headers).status_code == 403
    assert client.delete("/blocklist/999999", headers=provider_headers).status_code == 404

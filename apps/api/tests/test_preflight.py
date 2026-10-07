"""AC34 — preflight check before an agent sends (FR-42).

Deterministic + hermetic: the clock is pinned via the canonical ``app.clock.now`` dependency so the
expiry boundary is reproducible. Synthetic fixtures only.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app import clock

T0 = datetime(2026, 6, 1, tzinfo=timezone.utc)


def _fix_clock(app, instant: datetime) -> None:
    app.dependency_overrides[clock.now] = lambda: instant


def _approved_entry(client, provider_headers, *, expires_at: datetime | None = None) -> int:
    body = {"type": "event", "title": "Harbour Festival", "destination": "Galway"}
    if expires_at is not None:
        body["expires_at"] = expires_at.isoformat()
    r = client.post("/catalog", headers=provider_headers, json=body)
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    r = client.patch(
        f"/catalog/{entry_id}",
        headers=provider_headers,
        json={"status": "approved", "brand_safe": True},
    )
    assert r.status_code == 200, r.text
    return entry_id


def _project(client, agent_headers, item_ids: list[int]) -> int:
    r = client.post(
        "/me/projects", headers=agent_headers, json={"name": "Launch", "item_ids": item_ids}
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_preflight_passes_clean_composition(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    entry_id = _approved_entry(client, provider_headers, expires_at=T0 + timedelta(days=30))
    project_id = _project(client, agent_headers, [entry_id])

    r = client.post(
        "/social/preflight",
        headers=agent_headers,
        json={"composition_id": project_id, "channel": "instagram"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "issues": []}


def test_preflight_flags_expired_item(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    entry_id = _approved_entry(client, provider_headers, expires_at=T0 + timedelta(days=1))
    project_id = _project(client, agent_headers, [entry_id])

    _fix_clock(app, T0 + timedelta(days=2))  # item now expired
    r = client.post(
        "/social/preflight",
        headers=agent_headers,
        json={"composition_id": project_id, "channel": "instagram"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is False
    codes = {i["code"] for i in body["issues"]}
    assert "unavailable_items" in codes
    # Every issue states what's wrong AND how to fix it, in plain words (FR-42).
    assert all(i["message"] and i["fix"] for i in body["issues"])


def test_publish_blocked_until_preflight_clean(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    entry_id = _approved_entry(client, provider_headers, expires_at=T0 + timedelta(days=1))
    project_id = _project(client, agent_headers, [entry_id])
    body = {"composition_id": project_id, "channel": "instagram"}

    _fix_clock(app, T0 + timedelta(days=2))  # expired → scheduling must be blocked
    r = client.post("/social/schedule", headers=agent_headers, json=body)
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert detail["error"] == "preflight_failed"
    assert any(i["code"] == "unavailable_items" for i in detail["issues"])

    # Fix the problem (clock back inside validity) → the schedule now goes through, landing in
    # pending_approval; approving it then publishes (nothing sends without a review).
    _fix_clock(app, T0)
    r = client.post("/social/schedule", headers=agent_headers, json=body)
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "pending_approval"
    pid = r.json()["id"]
    approved = client.post(f"/social/posts/{pid}/approve", headers=agent_headers)
    assert approved.status_code == 200 and approved.json()["status"] == "published"


def test_preflight_no_content_and_unsupported_channel(client, agent_headers, app):
    """Empty composition + bad channel accumulate both issues in one result (ok stays False)."""
    _fix_clock(app, T0)
    empty = _project(client, agent_headers, [])

    r = client.post(
        "/social/preflight",
        headers=agent_headers,
        json={"composition_id": empty, "channel": "tiktok"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is False
    codes = {i["code"] for i in body["issues"]}
    assert codes == {"no_content", "unsupported_channel"}
    assert all(i["message"] and i["fix"] for i in body["issues"])


def test_preflight_flags_stale_item(client, provider_headers, agent_headers, app):
    """An item whose master content changed since it was saved is flagged as stale."""
    _fix_clock(app, T0)
    entry_id = _approved_entry(client, provider_headers, expires_at=T0 + timedelta(days=30))
    project_id = _project(client, agent_headers, [entry_id])  # snapshots content_version

    # Provider edits the master content → content_version bumps.
    assert (
        client.put(
            f"/catalog/{entry_id}", headers=provider_headers, json={"title": "Harbour Festival 2"}
        ).status_code
        == 200
    )

    r = client.post(
        "/social/preflight",
        headers=agent_headers,
        json={"composition_id": project_id, "channel": "instagram"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is False
    assert {i["code"] for i in body["issues"]} == {"stale_items"}

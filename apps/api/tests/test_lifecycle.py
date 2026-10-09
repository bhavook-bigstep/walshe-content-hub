"""AC32/AC33 — validity & status lifecycle and auto-withdraw propagation.

Deterministic + hermetic: the clock is overridden to fixed instants via the canonical
``app.clock.now`` dependency (FastAPI dependency override — the supported per-test swap). Synthetic
fixtures only; no real secrets or PII.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app import clock
from app.lifecycle import EXPIRING_SOON_WINDOW, display_status, is_expired
from app.models.catalog import DisplayStatus, EntryStatus

T0 = datetime(2026, 6, 1, tzinfo=timezone.utc)
# Keep tests hermetic: every time-sensitive case pins the clock to an instant above.


def _fix_clock(app, instant: datetime) -> None:
    app.dependency_overrides[clock.now] = lambda: instant


def _create_approved_entry(client, provider_headers, *, expires_at=None, valid_from=None) -> int:
    """Provider creates an entry, then approves + brand-safes it (with optional validity)."""
    body = {"type": "event", "title": "Harbour Festival", "destination": "Galway"}
    if valid_from is not None:
        body["valid_from"] = valid_from.isoformat()
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


# --------------------------------------------------------------------------- AC32


def test_display_status_derived_from_clock():
    """Boundary derivation over the pure helper (approved -> expiring_soon -> expired)."""
    expires = T0 + timedelta(days=10)
    # >14 days before expiry -> plain approved.
    assert display_status(EntryStatus.approved, expires, T0 - timedelta(days=14)) == (
        DisplayStatus.approved
    )
    # Within the 14-day window -> expiring_soon.
    assert display_status(EntryStatus.approved, expires, T0 + timedelta(days=1)) == (
        DisplayStatus.expiring_soon
    )
    # Exactly at expiry -> expired (half-open window).
    assert display_status(EntryStatus.approved, expires, T0 + timedelta(days=10)) == (
        DisplayStatus.expired
    )
    # Past expiry -> expired.
    assert display_status(EntryStatus.approved, expires, T0 + timedelta(days=11)) == (
        DisplayStatus.expired
    )
    # Withdrawn passes through; an entry with no expiry keeps its stored status (lives forever).
    assert display_status(EntryStatus.withdrawn, None, T0) == DisplayStatus.withdrawn
    assert display_status(EntryStatus.draft, None, T0) == DisplayStatus.draft
    assert display_status(EntryStatus.in_review, None, T0) == DisplayStatus.in_review
    # Expiry now applies to ANY (non-withdrawn) status (AC55): a past-expiry draft reads expired.
    assert (
        display_status(EntryStatus.draft, expires, T0 + timedelta(days=11))
        == DisplayStatus.expired
    )
    # No expiry -> always plain approved; the predicate agrees.
    assert display_status(EntryStatus.approved, None, T0) == DisplayStatus.approved
    assert is_expired(None, T0) is False
    assert is_expired(expires, expires) is True
    assert EXPIRING_SOON_WINDOW == timedelta(days=14)


def test_validity_and_status_serialise_on_entry(client, provider_headers, agent_headers, app):
    """Validity + derived display status serialise on EntryOut, for provider and agent alike."""
    expires = T0 + timedelta(days=5)
    valid = T0 - timedelta(days=1)
    _fix_clock(app, T0)
    entry_id = _create_approved_entry(
        client, provider_headers, expires_at=expires, valid_from=valid
    )

    # Provider PATCH response carries the three fields (role: provider).
    r = client.patch(f"/catalog/{entry_id}", headers=provider_headers, json={"brand_safe": True})
    assert r.status_code == 200
    body = r.json()
    assert body["valid_from"].startswith("2026-05-31")
    assert body["expires_at"].startswith("2026-06-06")
    assert body["display_status"] == "expiring_soon"  # within 14d of expiry at T0

    # Agent GET carries them too (role: agent).
    r = client.get(f"/catalog/{entry_id}", headers=agent_headers)
    assert r.status_code == 200
    got = r.json()
    assert got["valid_from"].startswith("2026-05-31")
    assert got["expires_at"].startswith("2026-06-06")
    assert got["display_status"] == "expiring_soon"


def test_validity_window_rejected_when_inverted(client, provider_headers):
    """An inverted validity window is refused at the boundary (422)."""
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={
            "type": "event",
            "title": "Bad window",
            "destination": "Galway",
            "valid_from": (T0 + timedelta(days=5)).isoformat(),
            "expires_at": T0.isoformat(),
        },
    )
    assert r.status_code == 422


# --------------------------------------------------------------------------- AC33


def test_expired_shown_greyed_but_not_usable(client, provider_headers, agent_headers, app):
    """AC55 — an expired entry STAYS in the agent catalog + search (shown greyed via
    display_status=expired) and is still viewable, but is dropped from the usable/build path."""
    expires = T0 + timedelta(days=1)
    _fix_clock(app, T0)
    entry_id = _create_approved_entry(client, provider_headers, expires_at=expires)

    # Before expiry: present and not yet expired.
    before = client.get("/catalog", headers=agent_headers).json()
    row = next(e for e in before if e["id"] == entry_id)
    assert row["display_status"] != "expired"

    # After expiry: still present in list + search, now marked expired, and GET still 200.
    _fix_clock(app, T0 + timedelta(days=2))
    row = next(
        (e for e in client.get("/catalog", headers=agent_headers).json() if e["id"] == entry_id),
        None,
    )
    assert row is not None and row["display_status"] == "expired"
    assert any(
        e["id"] == entry_id for e in client.get("/catalog?q=Harbour", headers=agent_headers).json()
    )
    assert client.get(f"/catalog/{entry_id}", headers=agent_headers).status_code == 200

    # But NOT usable: the build path drops the expired item (404 when nothing visible remains).
    assert (
        client.post(
            "/builder/design",
            headers=agent_headers,
            json={"prompt": "promote it", "item_ids": [entry_id]},
        ).status_code
        == 404
    )


def test_expired_dropped_from_projects_and_schedule(client, provider_headers, agent_headers, app):
    """An expired item drops from a saved project's resolved items and the builder/render path."""
    expires = T0 + timedelta(days=1)
    _fix_clock(app, T0)
    entry_id = _create_approved_entry(client, provider_headers, expires_at=expires)

    # Agent saves a project referencing the item and schedules a post for a composition.
    r = client.post(
        "/me/projects",
        headers=agent_headers,
        json={"name": "Launch", "item_ids": [entry_id]},
    )
    assert r.status_code == 201, r.text
    project_id = r.json()["id"]

    r = client.post(
        "/social/schedule",
        headers=agent_headers,
        json={"composition_id": project_id, "channel": "instagram"},
    )
    assert r.status_code == 201, r.text

    # Before expiry: the item resolves and the builder can see it.
    r = client.get(f"/me/projects/{project_id}/resolved", headers=agent_headers)
    assert r.status_code == 200
    assert [e["id"] for e in r.json()["items"]] == [entry_id]
    assert r.json()["dropped_item_ids"] == []
    assert (
        client.post(
            "/builder/design",
            headers=agent_headers,
            json={"prompt": "promote it", "item_ids": [entry_id]},
        ).status_code
        == 200
    )

    # After expiry: dropped from resolved items on its own; builder loses it -> 404.
    _fix_clock(app, T0 + timedelta(days=2))
    r = client.get(f"/me/projects/{project_id}/resolved", headers=agent_headers)
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["dropped_item_ids"] == [entry_id]
    assert (
        client.post(
            "/builder/design",
            headers=agent_headers,
            json={"prompt": "promote it", "item_ids": [entry_id]},
        ).status_code
        == 404
    )


def test_master_edit_flags_in_use_copies(client, provider_headers, agent_headers, app):
    """Editing a master item flags in-use copies without removing them; control stays unflagged."""
    _fix_clock(app, T0)
    edited_id = _create_approved_entry(client, provider_headers, expires_at=None)
    # A second, never-edited entry acts as the control.
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "place", "title": "Cliffs", "destination": "Clare"},
    )
    control_id = r.json()["id"]
    client.patch(
        f"/catalog/{control_id}",
        headers=provider_headers,
        json={"status": "approved", "brand_safe": True},
    )

    r = client.post(
        "/me/projects",
        headers=agent_headers,
        json={"name": "Mix", "item_ids": [edited_id, control_id]},
    )
    project_id = r.json()["id"]

    # No edits yet -> nothing flagged.
    r = client.get(f"/me/projects/{project_id}/resolved", headers=agent_headers)
    assert r.json()["flagged_item_ids"] == []

    # Provider edits the master content of one item -> content_version bumps.
    r = client.put(
        f"/catalog/{edited_id}", headers=provider_headers, json={"title": "Harbour Festival 2027"}
    )
    assert r.status_code == 200

    r = client.get(f"/me/projects/{project_id}/resolved", headers=agent_headers)
    body = r.json()
    assert body["flagged_item_ids"] == [edited_id]  # in-use copy flagged, control not
    assert edited_id in [e["id"] for e in body["items"]]  # still present, not removed


def test_withdrawn_hidden_from_agent(client, provider_headers, agent_headers, app):
    """A withdrawn entry is never visible to the agent (list + direct GET 404)."""
    _fix_clock(app, T0)
    entry_id = _create_approved_entry(client, provider_headers)
    assert any(e["id"] == entry_id for e in client.get("/catalog", headers=agent_headers).json())

    r = client.patch(f"/catalog/{entry_id}", headers=provider_headers, json={"status": "withdrawn"})
    assert r.status_code == 200
    assert r.json()["display_status"] == "withdrawn"
    assert all(e["id"] != entry_id for e in client.get("/catalog", headers=agent_headers).json())
    assert client.get(f"/catalog/{entry_id}", headers=agent_headers).status_code == 404

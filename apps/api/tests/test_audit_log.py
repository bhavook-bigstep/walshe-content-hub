"""AC37 — audit log read + CSV export (FR-16, Contract 3). Hermetic; synthetic data."""

from __future__ import annotations

from datetime import datetime, timezone

from app import clock

T0 = datetime(2026, 6, 1, tzinfo=timezone.utc)


def _fix_clock(app, instant: datetime) -> None:
    app.dependency_overrides[clock.now] = lambda: instant


def _approved_then_withdrawn(client, provider_headers) -> int:
    """Create + approve (overwrite audit) then withdraw (unpublish audit) — two audited actions."""
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "event", "title": "Regatta", "destination": "Kinsale"},
    )
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    assert (
        client.patch(
            f"/catalog/{entry_id}",
            headers=provider_headers,
            json={"status": "approved", "brand_safe": True},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/catalog/{entry_id}", headers=provider_headers, json={"status": "withdrawn"}
        ).status_code
        == 200
    )
    return entry_id


def test_audit_records_key_actions(client, provider_headers, admin_headers, app):
    _fix_clock(app, T0)
    entry_id = _approved_then_withdrawn(client, provider_headers)

    # Provider sees their own actions; the withdrawal is recorded as 'unpublish'.
    own = client.get("/audit", headers=provider_headers)
    assert own.status_code == 200, own.text
    own_rows = own.json()
    actions = {r["action"] for r in own_rows}
    assert "unpublish" in actions
    assert any(r["target_id"] == entry_id for r in own_rows)

    # A super admin sees at least as much (every row).
    all_rows = client.get("/audit", headers=admin_headers).json()
    assert len(all_rows) >= len(own_rows)


def test_audit_export_csv_for_authorised_roles(
    client, provider_headers, agent_headers, admin_headers, app
):
    _fix_clock(app, T0)
    _approved_then_withdrawn(client, provider_headers)

    # Agents are not authorised to read or export the audit log.
    assert client.get("/audit", headers=agent_headers).status_code == 403
    assert client.get("/audit/export", headers=agent_headers).status_code == 403

    # Admin export is a CSV with the expected header and the recorded action.
    r = client.get("/audit/export", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert "id,actor_id,action,target_type,target_id,created_at" in r.text
    assert "unpublish" in r.text


def test_audit_export_parses_with_the_right_actor(client, provider_headers, admin_headers, app):
    """Parse the CSV: exactly one row for the action, attributed to the acting provider.

    (Audit rows timestamp the real moment of the action, not the injected clock — that is the point
    of an audit trail — so we assert the row parses and is attributed correctly, not a fixed time.)
    """
    import csv
    import io
    from datetime import datetime

    _fix_clock(app, T0)
    entry_id = _approved_then_withdrawn(client, provider_headers)

    provider_id = next(
        u["id"]
        for u in client.get("/admin/users", headers=admin_headers).json()
        if u["role"] == "content_provider"
    )

    text = client.get("/audit/export", headers=admin_headers).text
    rows = list(csv.DictReader(io.StringIO(text)))
    unpublish = [r for r in rows if r["action"] == "unpublish" and int(r["target_id"]) == entry_id]
    assert len(unpublish) == 1
    assert int(unpublish[0]["actor_id"]) == provider_id
    datetime.fromisoformat(unpublish[0]["created_at"])  # a parseable ISO timestamp


def test_idempotent_blocklist_add_writes_one_audit_row(client, provider_headers, admin_headers):
    """Adding the same off-limits term twice is a no-op — it must not duplicate the audit trail."""
    client.post("/blocklist", headers=provider_headers, json={"term": "duplicatecheck"})
    client.post("/blocklist", headers=provider_headers, json={"term": "duplicatecheck"})

    rows = client.get("/audit", headers=admin_headers).json()
    adds = [
        r for r in rows if r["action"] == "blocklist_add" and r["target_type"] == "blocklist_term"
    ]
    assert len(adds) == 1

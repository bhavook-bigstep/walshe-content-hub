"""Contract 3 — destructive actions are traceable (audit log)."""
from __future__ import annotations

from sqlalchemy import select

from app.models.audit import AuditLog


def _create(client, provider_headers) -> int:
    resp = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "event", "title": "Doomed", "destination": "Galway"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_destructive_actions_are_logged(client, app, provider_headers):
    entry_id = _create(client, provider_headers)

    resp = client.delete(f"/catalog/{entry_id}", headers=provider_headers)
    assert resp.status_code == 204

    SessionLocal = app.state.sessionmaker
    with SessionLocal() as db:
        rows = db.execute(
            select(AuditLog).where(
                AuditLog.action == "delete",
                AuditLog.target_type == "catalog_entry",
                AuditLog.target_id == entry_id,
            )
        ).scalars().all()
    assert len(rows) == 1
    assert rows[0].actor_id > 0  # recorded who performed it (no PII, just the id)

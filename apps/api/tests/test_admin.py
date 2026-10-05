"""AC2 — Super Admin approves a content provider."""

from __future__ import annotations

from app.models.user import Role, User
from app.security import hash_password


def _add_unapproved_provider(app) -> int:
    SessionLocal = app.state.sessionmaker
    with SessionLocal() as db:
        provider = User(
            email="pending@test.local",
            password_hash=hash_password("test-pass-pending"),
            role=Role.content_provider,
            tenant_id=1,
            approved=False,
        )
        db.add(provider)
        db.commit()
        return provider.id


def test_approve_provider_flips_flag(client, app, admin_headers, agent_headers):
    provider_id = _add_unapproved_provider(app)

    # A non-admin cannot approve.
    assert (
        client.post(f"/admin/providers/{provider_id}/approve", headers=agent_headers).status_code
        == 403
    )

    # Admin approval flips the flag.
    resp = client.post(f"/admin/providers/{provider_id}/approve", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["approved"] is True

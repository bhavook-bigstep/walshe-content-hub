"""AC1 — 3-role login + RBAC."""
from __future__ import annotations


def test_role_guard_blocks_wrong_role(client, agent_headers, admin_headers):
    # Admin-only route rejects an agent token...
    assert client.get("/admin/users", headers=agent_headers).status_code == 403
    # ...and allows the correct role.
    ok = client.get("/admin/users", headers=admin_headers)
    assert ok.status_code == 200
    assert isinstance(ok.json(), list)


def test_missing_token_is_unauthorized(client):
    assert client.get("/admin/users").status_code == 401

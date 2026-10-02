"""Account provisioning (AC24): public agent self-register + Super-Admin user creation.

Hermetic — the conftest seeds one user per role with obviously-fake passwords; these tests add
synthetic accounts on top. No real secrets or PII (testing.md).
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_self_register_creates_agent_and_signs_in(client: TestClient) -> None:
    resp = client.post(
        "/auth/register", json={"email": "newagent@test.local", "password": "test-pass-123"}
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]

    me = client.get("/auth/me", headers=_bearer(token))
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["role"] == "tourism_agent"  # always an agent — no role self-selection
    assert body["approved"] is True  # agents need no verification
    assert body["tenant_id"] is None


def test_self_register_rejects_duplicate_and_weak_password(client: TestClient) -> None:
    # Duplicate email (agent@test.local is seeded) -> 409.
    dup = client.post(
        "/auth/register", json={"email": "agent@test.local", "password": "test-pass-123"}
    )
    assert dup.status_code == 409

    # Password under 8 chars -> 422 (schema validation).
    weak = client.post("/auth/register", json={"email": "weak@test.local", "password": "short"})
    assert weak.status_code == 422

    # Role escalation attempt: an extra 'role' field is ignored — the account is still an agent.
    esc = client.post(
        "/auth/register",
        json={"email": "esc@test.local", "password": "test-pass-123", "role": "super_admin"},
    )
    assert esc.status_code == 201
    me = client.get("/auth/me", headers=_bearer(esc.json()["access_token"]))
    assert me.json()["role"] == "tourism_agent"


def test_admin_creates_provider_with_org_unapproved(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    # Provider with an organization -> created, tied to a tenant, pending verification.
    prov = client.post(
        "/admin/users",
        headers=admin_headers,
        json={
            "email": "board@test.local",
            "password": "test-pass-123",
            "role": "content_provider",
            "organization": "Tourism Narnia",
        },
    )
    assert prov.status_code == 201, prov.text
    body = prov.json()
    assert body["role"] == "content_provider"
    assert body["approved"] is False
    assert body["tenant_id"] is not None

    # Provider without an organization -> 422.
    no_org = client.post(
        "/admin/users",
        headers=admin_headers,
        json={"email": "noorg@test.local", "password": "test-pass-123", "role": "content_provider"},
    )
    assert no_org.status_code == 422

    # Agent created by admin -> usable immediately, no tenant.
    agent = client.post(
        "/admin/users",
        headers=admin_headers,
        json={
            "email": "made-agent@test.local",
            "password": "test-pass-123",
            "role": "tourism_agent",
        },
    )
    assert agent.status_code == 201, agent.text
    assert agent.json()["approved"] is True
    assert agent.json()["tenant_id"] is None


def test_admin_create_user_guards_role_and_auth(
    client: TestClient, admin_headers: dict[str, str], agent_headers: dict[str, str]
) -> None:
    # Cannot mint another Super Admin.
    sa = client.post(
        "/admin/users",
        headers=admin_headers,
        json={"email": "sa@test.local", "password": "test-pass-123", "role": "super_admin"},
    )
    assert sa.status_code == 400

    # A non-admin cannot provision users.
    forbidden = client.post(
        "/admin/users",
        headers=agent_headers,
        json={"email": "x@test.local", "password": "test-pass-123", "role": "tourism_agent"},
    )
    assert forbidden.status_code == 403

    # Duplicate email -> 409.
    dup = client.post(
        "/admin/users",
        headers=admin_headers,
        json={"email": "agent@test.local", "password": "test-pass-123", "role": "tourism_agent"},
    )
    assert dup.status_code == 409

"""Shared test fixtures — hermetic SQLite, synthetic users, deterministic tokens.

No real secrets or PII: passwords are obvious fakes (``test-pass-*``) and the DB is a throwaway
file per test (Contract 4: reproducible, isolated).
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models.user import Role, Tenant, User
from app.security import hash_password

# Synthetic credentials — fake by construction (testing.md allows obviously-fake fixtures).
USERS = {
    Role.super_admin: ("admin@test.local", "test-pass-admin"),
    Role.content_provider: ("provider@test.local", "test-pass-prov"),
    Role.tourism_agent: ("agent@test.local", "test-pass-agent"),
}


@pytest.fixture
def settings(tmp_path) -> Settings:
    # _env_file=None keeps tests hermetic: a local apps/api/.env (e.g. real Instagram/S3 keys for a
    # live demo) must never leak into the test settings and flip connectors off their stubs.
    return Settings(
        _env_file=None,
        database_url=f"sqlite+pysqlite:///{tmp_path}/test.db",
        jwt_secret="test-secret-fixed",
        ai_provider="claude",
        anthropic_api_key=None,
        openai_api_key=None,
        gemini_api_key=None,
    )


@pytest.fixture
def app(settings: Settings):
    application = create_app(settings)
    # Insert one user per role with known fake passwords.
    SessionLocal = application.state.sessionmaker
    with SessionLocal() as db:
        # An organization (tenant id 1) the provider/agent belong to.
        db.add(Tenant(name="Test Tourism Board", verified=True, markets=["Ireland"]))
        db.flush()
        for role, (email, password) in USERS.items():
            db.add(
                User(
                    email=email,
                    password_hash=hash_password(password),
                    role=role,
                    tenant_id=1,
                    approved=True,
                )
            )
        db.commit()
    return application


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _token(client: TestClient, role: Role) -> str:
    email, password = USERS[role]
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def auth_header(client: TestClient, role: Role) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(client, role)}"}


@pytest.fixture
def admin_headers(client: TestClient) -> dict[str, str]:
    return auth_header(client, Role.super_admin)


@pytest.fixture
def provider_headers(client: TestClient) -> dict[str, str]:
    return auth_header(client, Role.content_provider)


@pytest.fixture
def agent_headers(client: TestClient) -> dict[str, str]:
    return auth_header(client, Role.tourism_agent)


def login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def second_agent_headers(client: TestClient) -> dict[str, str]:
    """A genuinely different tourism agent (agent2@test.local), for cross-agent isolation tests."""
    SessionLocal = client.app.state.sessionmaker
    with SessionLocal() as db:
        if not db.query(User).filter_by(email="agent2@test.local").first():
            db.add(User(email="agent2@test.local", password_hash=hash_password("test-pass-a2"),
                        role=Role.tourism_agent, tenant_id=1, approved=True))
            db.commit()
    return login_headers(client, "agent2@test.local", "test-pass-a2")

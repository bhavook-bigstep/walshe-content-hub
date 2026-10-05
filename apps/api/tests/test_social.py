"""AC14 social schedule/publish (simulated). Clock injected; synthetic data only."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import app.models.post  # noqa: F401  (register table before create_app/create_all)
from app import clock
from app.main import create_app
from app.models.audit import AuditLog
from app.models.composition import Composition
from app.models.user import Role
from app.routers import social
from app.services import social_sim
from tests.conftest import auth_header

FIXED = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)


@pytest.fixture
def sclient(settings):
    application = create_app(settings)
    application.include_router(social.router)
    application.dependency_overrides[clock.now] = lambda: FIXED
    with application.state.sessionmaker() as db:
        from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
        from app.models.user import User as U
        from app.security import hash_password
        from tests.conftest import USERS

        for role, (email, pw) in USERS.items():
            db.add(
                U(
                    email=email,
                    password_hash=hash_password(pw),
                    role=role,
                    tenant_id=1,
                    approved=True,
                )
            )
        db.commit()
        agent = db.scalars(select(U).where(U.role == Role.tourism_agent)).one()
        provider = db.scalars(select(U).where(U.role == Role.content_provider)).one()
        # An approved, brand-safe, unexpired entry so the composition passes preflight (AC34).
        entry = CatalogEntry(
            type=CatalogType.place,
            title="Cliffs",
            destination="Clare",
            status=EntryStatus.approved,
            brand_safe=True,
            provider_id=provider.id,
        )
        db.add(entry)
        db.flush()
        db.add(Composition(agent_id=agent.id, format="social", item_ids=[entry.id]))
        db.commit()
    with TestClient(application) as c:
        c.app_ = application
        yield c


def _agent(c):
    return auth_header(c, Role.tourism_agent)


def test_schedule_then_publish_transitions(sclient):
    h = _agent(sclient)
    body = {"composition_id": 1, "channel": "instagram"}
    r = sclient.post("/social/schedule", headers=h, json=body)
    assert r.status_code == 201
    assert r.json()["status"] == "scheduled"
    assert r.json()["published_at"] is None
    assert r.json()["scheduled_at"].startswith("2026-01-02T03:04:05")

    r = sclient.post("/social/publish", headers=h, json=body)
    assert r.status_code == 200
    assert r.json()["status"] == "published"
    assert r.json()["published_at"].startswith("2026-01-02T03:04:05")

    with sclient.app_.state.sessionmaker() as db:
        row = db.scalars(select(AuditLog)).one()
        assert (row.action, row.target_type) == ("publish", "post")


def test_publish_twice_conflicts(sclient):
    h = _agent(sclient)
    body = {"composition_id": 1, "channel": "x"}
    assert sclient.post("/social/publish", headers=h, json=body).status_code == 200
    assert sclient.post("/social/publish", headers=h, json=body).status_code == 409


def test_unpublish_audited(sclient):
    h = _agent(sclient)
    body = {"composition_id": 1, "channel": "x"}
    assert sclient.post("/social/unpublish", headers=h, json=body).status_code == 404
    sclient.post("/social/publish", headers=h, json=body)
    r = sclient.post("/social/unpublish", headers=h, json=body)
    assert r.json()["status"] == "scheduled" and r.json()["published_at"] is None
    with sclient.app_.state.sessionmaker() as db:
        actions = [a.action for a in db.scalars(select(AuditLog).order_by(AuditLog.id))]
    assert actions == ["publish", "unpublish"]


def test_agent_only_and_validation(sclient):
    body = {"composition_id": 1, "channel": "x"}
    assert sclient.post("/social/publish", json=body).status_code == 401
    ph = auth_header(sclient, Role.content_provider)
    assert sclient.post("/social/schedule", headers=ph, json=body).status_code == 403
    h = _agent(sclient)
    bad_channel = sclient.post("/social/schedule", headers=h, json={**body, "channel": "myspace"})
    assert bad_channel.status_code == 422
    missing_comp = sclient.post("/social/schedule", headers=h, json={**body, "composition_id": 99})
    assert missing_comp.status_code == 404


def test_connector_is_deterministic_and_validates():
    a = social_sim.publish(channel="x", composition_id=7, now=FIXED)
    b = social_sim.publish(channel="x", composition_id=7, now=FIXED)
    assert a == b
    with pytest.raises(social_sim.UnsupportedChannel):
        social_sim.publish(channel="nope", composition_id=7, now=FIXED)

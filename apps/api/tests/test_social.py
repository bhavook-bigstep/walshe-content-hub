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
        db.add(Composition(agent_id=agent.id, name="Cliffs promo", format="social",
                           item_ids=[entry.id]))
        db.commit()
    with TestClient(application) as c:
        c.app_ = application
        yield c


def _agent(c):
    return auth_header(c, Role.tourism_agent)


def _schedule(sclient, h, channel="instagram"):
    return sclient.post("/social/schedule", headers=h,
                        json={"composition_id": 1, "channel": channel})


def test_schedule_lands_pending_approval(sclient):
    h = _agent(sclient)
    r = _schedule(sclient, h)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending_approval"
    assert body["published_at"] is None
    assert body["scheduled_at"].startswith("2026-01-02T03:04:05")


def test_posts_list_persists_with_composition_name(sclient):
    # The list is served from the server so a refresh keeps it (the old page bug).
    h = _agent(sclient)
    _schedule(sclient, h)
    rows = sclient.get("/social/posts", headers=h).json()
    assert len(rows) == 1
    assert rows[0]["status"] == "pending_approval"
    assert rows[0]["composition_name"] == "Cliffs promo"  # project name, not "Post #1"


def test_approve_future_schedule_greenlights_then_posts_when_due(sclient):
    # Approve greenlights a future-scheduled post without publishing; it posts when the scheduled
    # time arrives (publish-due-on-load, since the PoC has no background worker).
    from datetime import timedelta

    h = _agent(sclient)
    future = (FIXED + timedelta(days=1)).isoformat()
    pid = sclient.post(
        "/social/schedule", headers=h,
        json={"composition_id": 1, "channel": "instagram", "scheduled_at": future},
    ).json()["id"]

    r = sclient.post(f"/social/posts/{pid}/approve", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"  # greenlit, not yet posted
    assert r.json()["published_at"] is None

    # Time passes; listing the posts publishes the ones now due.
    sclient.app_.dependency_overrides[clock.now] = lambda: FIXED + timedelta(days=2)
    post = next(p for p in sclient.get("/social/posts", headers=h).json() if p["id"] == pid)
    assert post["status"] == "published"
    assert post["published_at"] is not None


def test_approve_past_schedule_posts_immediately(sclient):
    # If the scheduled time already passed, approving posts right away.
    from datetime import timedelta

    h = _agent(sclient)
    past = (FIXED - timedelta(days=1)).isoformat()
    pid = sclient.post(
        "/social/schedule", headers=h,
        json={"composition_id": 1, "channel": "instagram", "scheduled_at": past},
    ).json()["id"]

    r = sclient.post(f"/social/posts/{pid}/approve", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "published"
    assert r.json()["published_at"] is not None


def test_posts_list_orders_pending_first(sclient):
    # Pending-approval posts (the ones needing action) sort to the top, even when a published post
    # has a newer id — the reviewer sees what to act on first.
    h = _agent(sclient)
    a = _schedule(sclient, h, channel="instagram").json()["id"]  # stays pending
    b = _schedule(sclient, h, channel="facebook").json()["id"]  # approved → published (higher id)
    assert sclient.post(f"/social/posts/{b}/approve", headers=h).status_code == 200
    rows = sclient.get("/social/posts", headers=h).json()
    assert rows[0]["id"] == a and rows[0]["status"] == "pending_approval"
    assert rows[1]["id"] == b and rows[1]["status"] == "published"


def test_approve_publishes_via_simulated_connector(sclient):
    h = _agent(sclient)
    pid = _schedule(sclient, h).json()["id"]
    r = sclient.post(f"/social/posts/{pid}/approve", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "published"
    assert body["published_at"].startswith("2026-01-02T03:04:05")
    assert body["external_id"].startswith("sim-instagram-")
    with sclient.app_.state.sessionmaker() as db:
        actions = [a.action for a in db.scalars(select(AuditLog).order_by(AuditLog.id))]
    assert actions == ["schedule", "approve", "publish"]


def test_reject_sets_rejected_with_note(sclient):
    h = _agent(sclient)
    pid = _schedule(sclient, h).json()["id"]
    r = sclient.post(f"/social/posts/{pid}/reject", headers=h, json={"note": "off-brand"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"
    assert r.json()["review_note"] == "off-brand"


def test_cannot_approve_a_non_pending_post(sclient):
    h = _agent(sclient)
    pid = _schedule(sclient, h).json()["id"]
    assert sclient.post(f"/social/posts/{pid}/approve", headers=h).status_code == 200
    # already published -> a second approve is a 409, not a re-publish
    assert sclient.post(f"/social/posts/{pid}/approve", headers=h).status_code == 409


def test_agent_only_and_validation(sclient):
    body = {"composition_id": 1, "channel": "x"}
    assert sclient.post("/social/schedule", json=body).status_code == 401
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

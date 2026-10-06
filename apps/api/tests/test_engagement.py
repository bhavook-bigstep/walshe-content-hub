"""AC15 engagement dashboard — synthetic rows inserted directly (decoupled from app seeding)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models.base import Base
from app.models.engagement import Engagement
from app.routers import engagement as engagement_router


@pytest.fixture
def eng_app(app):
    # Model/router registration in the app is deferred (t6); wire them up for this test only.
    Base.metadata.create_all(app.state.engine)
    app.include_router(engagement_router.router)
    return app


@pytest.fixture
def eng_client(eng_app, client):
    return client


def _insert(app, rows):
    with app.state.sessionmaker() as db:
        db.add_all([Engagement(**r) for r in rows])
        db.commit()


def test_dashboard_returns_seeded_metrics(eng_app, eng_client, agent_headers):
    when = datetime(2026, 1, 15, tzinfo=timezone.utc)
    rows = [
        {"post_id": 2, "platform": "instagram",
         "metrics": {"reach": 500, "likes": 12}, "fetched_at": when},
        {"post_id": 1, "platform": "instagram",
         "metrics": {"reach": 1000, "likes": 30}, "fetched_at": when},
    ]
    _insert(eng_app, rows)

    resp = eng_client.get("/engagement", headers=agent_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert [r["post_id"] for r in body] == [1, 2]  # ordered by post_id
    assert body[0]["platform"] == "instagram"
    assert body[0]["metrics"] == {"reach": 1000, "likes": 30}


def test_dashboard_is_agent_only(eng_app, eng_client, provider_headers, admin_headers):
    assert eng_client.get("/engagement").status_code == 401
    assert eng_client.get("/engagement", headers=provider_headers).status_code == 403
    assert eng_client.get("/engagement", headers=admin_headers).status_code == 403


def _make_agent_post(app, external_id="MREF"):
    from sqlalchemy import select

    from app.models.composition import Composition
    from app.models.post import Post, PostStatus
    from app.models.user import Role, User

    with app.state.sessionmaker() as db:
        agent = db.execute(select(User).where(User.role == Role.tourism_agent)).scalar_one()
        comp = Composition(agent_id=agent.id, format="social", item_ids=[])
        db.add(comp)
        db.flush()
        db.add(
            Post(
                composition_id=comp.id,
                channel="instagram",
                platform="instagram",
                status=PostStatus.published,
                external_id=external_id,
                published_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
            )
        )
        db.commit()


def test_refresh_syncs_agents_own_posts(eng_app, eng_client, agent_headers):
    _make_agent_post(eng_app)
    resp = eng_client.post("/engagement/refresh", headers=agent_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["synced"] == 1  # stub connector (no keys), explicit post_ids override age
    assert eng_client.get("/engagement", headers=agent_headers).json()  # a snapshot now exists


def test_refresh_is_agent_only(eng_app, eng_client, provider_headers):
    assert eng_client.post("/engagement/refresh", headers=provider_headers).status_code == 403

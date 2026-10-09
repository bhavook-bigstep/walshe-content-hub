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


def test_dashboard_returns_agents_metrics(eng_app, eng_client, agent_headers):
    pid = _make_agent_post(eng_app, external_id="G1")
    _add_engagement(eng_app, pid, {"reach": 1000, "likes": 30})

    resp = eng_client.get("/engagement", headers=agent_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["post_id"] == pid
    assert body[0]["platform"] == "instagram"
    assert body[0]["metrics"] == {"reach": 1000, "likes": 30}


def test_dashboard_is_scoped_to_calling_agent(eng_app, eng_client, agent_headers):
    # The calling agent's own post...
    mine = _make_agent_post(eng_app, external_id="MINE")
    _add_engagement(eng_app, mine, {"reach": 10})
    # ...and a different agent's post — which must NOT appear.
    from app.models.user import Role, User
    from app.security import hash_password

    with eng_app.state.sessionmaker() as db:
        db.add(
            User(
                email="agent2@test.local",
                password_hash=hash_password("test-pass-agent2"),
                role=Role.tourism_agent,
                tenant_id=1,
                approved=True,
            )
        )
        db.commit()
    other = _make_agent_post(eng_app, external_id="OTHER", agent_email="agent2@test.local")
    _add_engagement(eng_app, other, {"reach": 999})

    body = eng_client.get("/engagement", headers=agent_headers).json()
    assert [r["post_id"] for r in body] == [mine]  # only the caller's own metrics


def test_dashboard_is_agent_only(eng_app, eng_client, provider_headers, admin_headers):
    assert eng_client.get("/engagement").status_code == 401
    assert eng_client.get("/engagement", headers=provider_headers).status_code == 403
    assert eng_client.get("/engagement", headers=admin_headers).status_code == 403


def _make_agent_post(app, external_id="MREF", agent_email="agent@test.local") -> int:
    """Create a published post owned by the given agent; return its id."""
    from sqlalchemy import select

    from app.models.composition import Composition
    from app.models.post import Post, PostStatus
    from app.models.user import User

    with app.state.sessionmaker() as db:
        agent = db.execute(select(User).where(User.email == agent_email)).scalar_one()
        comp = Composition(agent_id=agent.id, format="social", item_ids=[])
        db.add(comp)
        db.flush()
        post = Post(
            composition_id=comp.id,
            channel="instagram",
            platform="instagram",
            status=PostStatus.published,
            external_id=external_id,
            published_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
        )
        db.add(post)
        db.flush()
        pid = post.id
        db.commit()
    return pid


def _add_engagement(app, post_id, metrics):
    with app.state.sessionmaker() as db:
        db.add(
            Engagement(
                post_id=post_id,
                platform="instagram",
                metrics=metrics,
                fetched_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
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


def test_rows_carry_project_and_campaign_names(eng_app, eng_client, agent_headers):
    # AC81: each engagement row is enriched with its project (composition) + campaign name, so the
    # dashboard reads by name and can break performance down per campaign.
    from datetime import date

    from sqlalchemy import select

    from app.models.campaign import Campaign, CampaignStatus
    from app.models.composition import Composition
    from app.models.post import Post, PostStatus
    from app.models.user import User

    with eng_app.state.sessionmaker() as db:
        agent = db.execute(select(User).where(User.email == "agent@test.local")).scalar_one()
        camp = Campaign(
            agent_id=agent.id, name="Autumn on the Wild Atlantic", destination="Ireland",
            starts_on=date(2026, 10, 1), ends_on=date(2026, 10, 31),
            status=CampaignStatus.active, created_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        )
        db.add(camp)
        db.flush()
        comp = Composition(
            agent_id=agent.id, name="Galway launch post", format="social", item_ids=[]
        )
        db.add(comp)
        db.flush()
        post = Post(
            composition_id=comp.id, campaign_id=camp.id, channel="instagram", platform="instagram",
            status=PostStatus.published, external_id="X1",
            published_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
        )
        db.add(post)
        db.flush()
        pid = post.id
        db.commit()
    _add_engagement(eng_app, pid, {"reach": 500})

    body = eng_client.get("/engagement", headers=agent_headers).json()
    row = next(r for r in body if r["post_id"] == pid)
    assert row["composition_name"] == "Galway launch post"
    assert row["campaign_name"] == "Autumn on the Wild Atlantic"

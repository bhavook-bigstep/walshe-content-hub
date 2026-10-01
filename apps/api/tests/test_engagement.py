"""AC15 engagement dashboard — synthetic rows inserted directly (decoupled from app seeding)."""
from __future__ import annotations

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
    rows = [
        {"post_id": 2, "impressions": 500, "clicks": 40, "engagement": 12},
        {"post_id": 1, "impressions": 1000, "clicks": 90, "engagement": 30},
    ]
    _insert(eng_app, rows)

    resp = eng_client.get("/engagement", headers=agent_headers)

    assert resp.status_code == 200
    assert resp.json() == sorted(rows, key=lambda r: r["post_id"])


def test_dashboard_is_agent_only(eng_app, eng_client, provider_headers, admin_headers):
    assert eng_client.get("/engagement").status_code == 401
    assert eng_client.get("/engagement", headers=provider_headers).status_code == 403
    assert eng_client.get("/engagement", headers=admin_headers).status_code == 403

"""Task 6 — the background insights worker starts only when enabled; startup stays clean."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_worker_not_started_when_disabled(app):
    # The conftest settings leave insights_sync_enabled False, so no background task runs in tests.
    with TestClient(app) as c:
        assert c.get("/health").json() == {"status": "ok"}
        assert getattr(app.state, "insights_worker_task", None) is None


def test_worker_started_when_enabled(settings):
    enabled = settings.model_copy(update={"insights_sync_enabled": True})
    application = create_app(enabled)
    with TestClient(application) as c:
        assert c.get("/health").status_code == 200
        assert application.state.insights_worker_task is not None

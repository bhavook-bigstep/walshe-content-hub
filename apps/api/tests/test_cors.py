"""CORS middleware: enabled only when CORS_ORIGINS is set, and only for the listed origin(s).

Browser dev/e2e needs cross-origin access; prod (empty CORS_ORIGINS) stays closed by default.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

_BASE = dict(database_url="sqlite+pysqlite:///:memory:", jwt_secret="test-secret-fixed")
_ORIGIN = "http://localhost:3100"


def test_allowed_origin_gets_cors_header() -> None:
    app = create_app(Settings(cors_origins=_ORIGIN, **_BASE))
    with TestClient(app) as c:
        res = c.get("/health", headers={"Origin": _ORIGIN})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == _ORIGIN


def test_no_cors_middleware_when_unset() -> None:
    app = create_app(Settings(cors_origins="", **_BASE))
    with TestClient(app) as c:
        res = c.get("/health", headers={"Origin": _ORIGIN})
    assert res.status_code == 200
    # Default posture is closed: no CORS header echoed for the origin.
    assert "access-control-allow-origin" not in res.headers

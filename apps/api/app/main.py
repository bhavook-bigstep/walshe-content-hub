"""FastAPI application factory (AC17 entry point).

``create_app`` builds the engine/sessionmaker/storage from ``Settings`` and registers routers.
Tests call it with an isolated in-memory SQLite settings for hermetic, deterministic runs.
"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import INSECURE_JWT_SECRET, Settings, get_settings
from app.db import create_all, make_engine, make_sessionmaker
from app.routers import admin, assets, auth, builder, catalog, engagement, render, social
from app.storage.minio_client import get_storage


def _require_secure_jwt_secret(settings: Settings) -> None:
    """Fail fast rather than sign/verify tokens with an absent or world-known secret.

    A deployment that starts without ``JWT_SECRET`` (or with the committed placeholder) would let
    anyone forge a bearer token for any user/role — a full auth bypass. Refuse to boot instead.
    """
    if not settings.jwt_secret or settings.jwt_secret == INSECURE_JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET is not configured (empty or the committed placeholder). Set a strong, "
            "unique JWT_SECRET in the environment before starting the API."
        )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    _require_secure_jwt_secret(settings)
    app = FastAPI(title="Walsh Content Hub API")

    engine = make_engine(settings.database_url)
    create_all(engine)

    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = make_sessionmaker(engine)
    app.state.storage = get_storage(settings)

    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(catalog.router)
    app.include_router(assets.router)
    app.include_router(render.router)
    app.include_router(builder.router)
    app.include_router(social.router)
    app.include_router(engagement.router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app

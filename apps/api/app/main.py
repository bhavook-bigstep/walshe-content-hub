"""FastAPI application factory (AC17 entry point).

``create_app`` builds the engine/sessionmaker/storage from ``Settings`` and registers routers.
Tests call it with an isolated in-memory SQLite settings for hermetic, deterministic runs.
"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import Settings, get_settings
from app.db import create_all, make_engine, make_sessionmaker
from app.routers import admin, assets, auth, catalog, render
from app.storage.minio_client import get_storage


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
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

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app

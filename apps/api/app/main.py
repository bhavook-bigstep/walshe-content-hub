"""FastAPI application factory (AC17 entry point).

``create_app`` builds the engine/sessionmaker/storage from ``Settings`` and registers routers.
Tests call it with an isolated in-memory SQLite settings for hermetic, deterministic runs.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import INSECURE_JWT_SECRET, Settings, get_settings
from app.db import create_all, make_engine, make_sessionmaker
from app.observability import configure_langsmith
from app.routers import (
    admin,
    agent,
    assets,
    assistant,
    audit_log,
    auth,
    blocklist,
    builder,
    catalog,
    engagement,
    instagram,
    observability,
    org,
    provider,
    render,
    social,
)
from app.storage.minio_client import get_storage

log = logging.getLogger(__name__)


async def _insights_worker(app: FastAPI) -> None:
    """Every ``insights_sync_interval_seconds``, pull Instagram insights for recent published posts.

    Imports are local so the module stays import-light and tests that never enable the worker don't
    pay for it. Per-tick errors are logged, never fatal — the loop keeps running.
    """
    from app import clock
    from app.services.insights_sync import sync_insights
    from app.social.factory import get_insights_connector

    settings: Settings = app.state.settings
    while True:
        await asyncio.sleep(settings.insights_sync_interval_seconds)
        try:
            with app.state.sessionmaker() as db:
                sync_insights(
                    db,
                    get_insights_connector(settings),
                    clock.now(),
                    max_age_days=settings.insights_max_age_days,
                )
        except Exception:  # noqa: BLE001 - a bad tick must not kill the loop
            log.exception("insights sync tick failed")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start the background insights worker when enabled; always cancel it on shutdown."""
    task: asyncio.Task | None = None
    if app.state.settings.insights_sync_enabled:
        task = asyncio.create_task(_insights_worker(app))
    app.state.insights_worker_task = task
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


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
    app = FastAPI(title="Walsh Content Hub API", lifespan=lifespan)

    engine = make_engine(settings.database_url)
    create_all(engine)

    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = make_sessionmaker(engine)
    app.state.storage = get_storage(settings)

    # AC45: turn on LangSmith tracing only when a key is configured (no-op otherwise — no egress).
    configure_langsmith(settings)

    # Browser CORS for local dev / e2e only (origins from CORS_ORIGINS). Empty in prod → no
    # middleware, so the default posture stays closed and same-origin.
    cors_origins = settings.cors_origin_list()
    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(catalog.router)
    app.include_router(assets.router)
    app.include_router(render.router)
    app.include_router(builder.router)
    app.include_router(social.router)
    app.include_router(instagram.router)
    app.include_router(engagement.router)
    app.include_router(org.router)
    app.include_router(provider.router)
    app.include_router(agent.router)
    app.include_router(blocklist.router)
    app.include_router(audit_log.router)
    app.include_router(assistant.router)
    app.include_router(observability.router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app

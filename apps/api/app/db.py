"""Database engine/session wiring.

Kept framework-light: ``create_app`` builds an engine from ``Settings`` and stashes a sessionmaker
on ``app.state`` so tests can inject an isolated in-memory SQLite engine (hermetic + deterministic,
Contract 4) without touching module globals.
"""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.models.base import Base


def make_engine(database_url: str) -> Engine:
    """Create an Engine. SQLite needs ``check_same_thread=False`` for the TestClient thread pool."""
    connect_args = {}
    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_engine(database_url, connect_args=connect_args, future=True)


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def create_all(engine: Engine) -> None:
    """Create tables for every registered model (PoC: no Alembic step in tests/seed)."""
    # Import for side effect: registers all mappers on Base.metadata.
    import app.models  # noqa: F401

    Base.metadata.create_all(engine)

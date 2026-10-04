"""AC44 (pgvector path) — a real pgvector integration test, gated on a Postgres being available.

Hermetic `make verify` runs on SQLite, so this is SKIPPED there. To exercise the real pgvector
backend, start the compose Postgres and point TEST_DATABASE_URL at it, e.g.:

    docker compose -f infra/docker-compose.yml up -d db
    TEST_DATABASE_URL=postgresql+psycopg://walsh:walsh@localhost:5432/walsh \
        uv run --project apps/api pytest apps/api/tests/test_pgvector_integration.py

The Postgres must have the pgvector extension available (the backend runs CREATE EXTENSION).
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text

from app.ai.stub import StubProvider
from app.models.catalog import CatalogEntry
from app.services.retrieval import PgVectorRetrievalBackend

PG_URL = os.environ.get("TEST_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not PG_URL.startswith("postgresql"),
    reason="set TEST_DATABASE_URL to a Postgres (pgvector) to run the pgvector integration test",
)


def _mk(entry_id: int, title: str, description: str) -> CatalogEntry:
    return CatalogEntry(
        id=entry_id, title=title, description=description, destination="Ireland", highlights=[]
    )


def test_pgvector_backend_ranks_with_real_pgvector():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(PG_URL)
    db = sessionmaker(engine)()
    backend = PgVectorRetrievalBackend()
    entries = [
        _mk(1, "City Marathon", "An urban road running race downtown."),
        _mk(2, "Cliffs of Moher", "Dramatic sea cliffs on the wild Atlantic coast."),
    ]
    try:
        ranked = backend.rank(db, "dramatic sea cliffs", entries, StubProvider(), limit=2)
        assert [s.entry.id for s in ranked][0] == 2  # pgvector ordered the cliffs item first
        assert len(ranked) == 2
        assert 0.0 <= ranked[0].vector <= 1.0  # similarity came from pgvector's <=>
        # Idempotent: a second run (re-upsert) gives the same ordering.
        again = backend.rank(db, "dramatic sea cliffs", entries, StubProvider(), limit=2)
        assert [s.entry.id for s in again] == [s.entry.id for s in ranked]
    finally:
        db.execute(text("DROP TABLE IF EXISTS catalog_embeddings"))
        db.commit()
        db.close()
        engine.dispose()

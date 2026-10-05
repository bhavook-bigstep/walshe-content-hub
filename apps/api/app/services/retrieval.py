"""Hybrid semantic retrieval + rerank (AC44), behind one backend interface.

Two backends implement the same ``rank`` contract:
- ``CosineRetrievalBackend`` — deterministic in-Python cosine + keyword blend. Used on SQLite and in
  the hermetic tests (Contract 4), and anywhere pgvector isn't available.
- ``PgVectorRetrievalBackend`` — real pgvector ANN on Postgres (``embedding <=> query``), then the
  same keyword blend as a rerank. Selected automatically when the engine is PostgreSQL.

Both rank a set of *already-visible* candidate entries (Contract 1 scoping stays in code), and both
embed through the AC16 provider gateway, so the embedding is deterministic offline and real with a
model. Score = w_vec·cosine + w_kw·keyword-overlap — a lexical+vector blend standing in for a neural
reranker at PoC scale.
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.ai.base import AIProvider
from app.ai.embedding import EMBED_DIM, cosine
from app.models.catalog import CatalogEntry

logger = logging.getLogger("app.services.retrieval")

_VEC_WEIGHT = 0.6
_KW_WEIGHT = 0.4


def entry_text(entry: CatalogEntry) -> str:
    """The text an entry is embedded/keyword-matched on."""
    return " ".join([entry.title, entry.description, entry.destination, *(entry.highlights or [])])


def _keyword_score(query: str, entry: CatalogEntry) -> float:
    q = set(re.findall(r"[a-z0-9]+", query.lower()))
    if not q:
        return 0.0
    words = set(re.findall(r"[a-z0-9]+", entry_text(entry).lower()))
    return len(q & words) / len(q)


@dataclass(frozen=True)
class Scored:
    entry: CatalogEntry
    score: float
    vector: float
    keyword: float


class RetrievalBackend(Protocol):
    name: str

    def rank(
        self,
        db: Session,
        query: str,
        entries: list[CatalogEntry],
        provider: AIProvider,
        *,
        limit: int,
    ) -> list[Scored]: ...


def _blend(vector: float, keyword: float) -> float:
    return _VEC_WEIGHT * max(0.0, vector) + _KW_WEIGHT * keyword


class CosineRetrievalBackend:
    """Deterministic cosine + keyword blend (SQLite / hermetic tests / no pgvector)."""

    name = "cosine"

    def rank(self, db, query, entries, provider, *, limit):
        qv = provider.embed(query)
        scored = []
        for e in entries:
            vs = cosine(qv, provider.embed(entry_text(e)))
            ks = _keyword_score(query, e)
            scored.append(Scored(e, _blend(vs, ks), vs, ks))
        scored.sort(key=lambda s: (-s.score, s.entry.id))
        return scored[:limit]


class PgVectorRetrievalBackend:
    """Real pgvector ANN on Postgres, reranked by the keyword blend."""

    name = "pgvector"
    _ready = False

    def _ensure_schema(self, db: Session) -> None:
        if self._ready:
            return
        db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        db.execute(
            text(
                f"CREATE TABLE IF NOT EXISTS catalog_embeddings "
                f"(entry_id integer PRIMARY KEY, embedding vector({EMBED_DIM}))"
            )
        )
        db.commit()
        self._ready = True

    @staticmethod
    def _literal(vec: list[float]) -> str:
        if len(vec) != EMBED_DIM or not all(math.isfinite(x) for x in vec):
            raise ValueError("embedding has wrong dimension or non-finite values")
        return "[" + ",".join(repr(float(x)) for x in vec) + "]"  # our own floats; no user input

    def rank(self, db, query, entries, provider, *, limit):
        if not entries:
            return []
        try:
            return self._rank(db, query, entries, provider, limit=limit)
        except (SQLAlchemyError, ValueError) as err:
            # pgvector missing/unprivileged, or a bad embedding → degrade to the cosine backend
            # rather than 500. The cosine backend returns the same shape over the same candidates.
            logger.warning(
                "pgvector retrieval failed (%s); falling back to cosine", type(err).__name__
            )
            db.rollback()
            return _COSINE.rank(db, query, entries, provider, limit=limit)

    def _rank(self, db, query, entries, provider, *, limit):
        self._ensure_schema(db)
        # Upsert embeddings for the candidate (visible) entries, then let pgvector order them.
        for e in entries:
            db.execute(
                text(
                    "INSERT INTO catalog_embeddings (entry_id, embedding) VALUES (:id, :v) "
                    "ON CONFLICT (entry_id) DO UPDATE SET embedding = EXCLUDED.embedding"
                ),
                {"id": e.id, "v": self._literal(provider.embed(entry_text(e)))},
            )
        db.commit()
        ids = [e.id for e in entries]
        qv = self._literal(provider.embed(query))
        rows = db.execute(
            text(
                "SELECT entry_id, 1 - (embedding <=> :qv) AS sim FROM catalog_embeddings "
                "WHERE entry_id = ANY(:ids) ORDER BY embedding <=> :qv"
            ),
            {"qv": qv, "ids": ids},
        ).all()
        sim = {rid: float(s) for rid, s in rows}
        by_id = {e.id: e for e in entries}
        scored = []
        for rid in sim:
            kw = _keyword_score(query, by_id[rid])
            scored.append(Scored(by_id[rid], _blend(sim[rid], kw), sim[rid], kw))
        scored.sort(key=lambda s: (-s.score, s.entry.id))
        return scored[:limit]


# Cached backends: the pgvector singleton keeps its schema-ready flag across requests so the DDL
# doesn't re-run on every call.
_COSINE = CosineRetrievalBackend()
_PGVECTOR = PgVectorRetrievalBackend()


def get_backend(db: Session) -> RetrievalBackend:
    """pgvector on PostgreSQL, else the deterministic cosine backend (SQLite / tests)."""
    bind = db.get_bind()
    dialect = bind.dialect.name if bind is not None else "sqlite"
    return _PGVECTOR if dialect == "postgresql" else _COSINE


def rank_entries(
    db: Session, query: str, entries: list[CatalogEntry], provider: AIProvider, *, limit: int = 8
) -> list[CatalogEntry]:
    """Convenience: hybrid-rank the candidate entries and return the entries best-first."""
    return [s.entry for s in get_backend(db).rank(db, query, entries, provider, limit=limit)]

"""AC44 — hybrid semantic retrieval + rerank, backend selection, deterministic embeddings."""

from __future__ import annotations

from app.ai.embedding import cosine, deterministic_embedding
from app.ai.stub import StubProvider
from app.models.catalog import CatalogEntry
from app.services import retrieval


def _mk(entry_id: int, title: str, description: str) -> CatalogEntry:
    return CatalogEntry(
        id=entry_id, title=title, description=description, destination="Ireland", highlights=[]
    )


def test_embedding_is_deterministic_and_cosine_reflects_overlap():
    a = deterministic_embedding("dramatic sea cliffs")
    assert a == deterministic_embedding("dramatic sea cliffs")  # stable
    assert abs(cosine(a, a) - 1.0) < 1e-9
    near = cosine(a, deterministic_embedding("sea cliffs on the coast"))
    far = cosine(a, deterministic_embedding("downtown marathon running"))
    assert near > far  # shared words → higher similarity


def test_hybrid_rank_puts_the_relevant_item_first():
    entries = [
        _mk(1, "City Marathon", "An urban road running race downtown."),
        _mk(2, "Cliffs of Moher", "Dramatic sea cliffs on the wild Atlantic coast."),
    ]
    ranked = retrieval.CosineRetrievalBackend().rank(
        None, "dramatic sea cliffs", entries, StubProvider(), limit=2
    )
    assert [s.entry.id for s in ranked][0] == 2  # the cliffs item ranks first
    assert ranked[0].score >= ranked[1].score


def test_rank_is_deterministic_and_respects_limit():
    entries = [_mk(i, f"Item {i}", f"word{i} shared coast") for i in range(5)]
    backend = retrieval.CosineRetrievalBackend()
    first = [s.entry.id for s in backend.rank(None, "coast", entries, StubProvider(), limit=3)]
    second = [s.entry.id for s in backend.rank(None, "coast", entries, StubProvider(), limit=3)]
    assert first == second and len(first) == 3  # reproducible + capped


def test_backend_selection_is_cosine_on_sqlite(app):
    db = app.state.sessionmaker()
    try:
        assert retrieval.get_backend(db).name == "cosine"
    finally:
        db.close()


def test_rank_tie_breaks_by_id():
    # Two near-identical entries → deterministic order by id (3 before 5).
    entries = [_mk(5, "Coast", "shared coast words"), _mk(3, "Coast", "shared coast words")]
    ranked = retrieval.CosineRetrievalBackend().rank(
        None, "coast", entries, StubProvider(), limit=2
    )
    assert [s.entry.id for s in ranked] == [3, 5]


def test_rank_handles_empty_entries_and_empty_query():
    backend = retrieval.CosineRetrievalBackend()
    assert backend.rank(None, "coast", [], StubProvider(), limit=5) == []
    # An empty query must not raise (keyword score 0, vector still defined).
    out = backend.rank(None, "", [_mk(1, "A", "b")], StubProvider(), limit=5)
    assert len(out) == 1


def test_cosine_edge_cases():
    assert cosine([0.0, 0.0], [1.0, 0.0]) == 0.0
    assert cosine([1.0], [1.0, 2.0]) == 0.0  # mismatched lengths
    assert deterministic_embedding("") == [0.0] * len(deterministic_embedding("x"))


def test_get_backend_selects_pgvector_on_postgres_dialect():
    class _Dialect:
        name = "postgresql"

    class _Bind:
        dialect = _Dialect()

    class _DB:
        def get_bind(self):
            return _Bind()

    assert retrieval.get_backend(_DB()).name == "pgvector"


def test_literal_rejects_bad_embeddings():
    import pytest

    from app.services.retrieval import PgVectorRetrievalBackend

    with pytest.raises(ValueError):
        PgVectorRetrievalBackend._literal([1.0, 2.0])  # wrong dimension

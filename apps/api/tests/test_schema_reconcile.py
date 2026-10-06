"""Additive schema reconciliation (PoC Alembic stand-in).

``create_all`` must survive a column-adding commit against a *persisted* database: plain
``Base.metadata.create_all`` only runs ``CREATE TABLE IF NOT EXISTS`` and never alters an existing
table, so a new mapped column would be missing and every INSERT would fail (Contract 4). These tests
simulate an older on-disk schema with SQLite and assert the missing column is added back, typed,
indexed and back-filled, so inserts succeed. Hermetic + deterministic: throwaway file DB, synthetic
rows only.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.db import _reconcile_added_columns, create_all, make_engine, make_sessionmaker
from app.models.catalog import CatalogEntry, CatalogType, EntryStatus, EntryVisibility


def _engine(tmp_path):
    return make_engine(f"sqlite+pysqlite:///{tmp_path}/reconcile.db")


def _add_entry(engine, title: str, *, ai_created: bool) -> None:
    """Insert one synthetic entry through the ORM so every Python-side default is applied."""
    with make_sessionmaker(engine)() as db:
        db.add(
            CatalogEntry(
                type=CatalogType.event,
                title=title,
                destination="Ireland",
                status=EntryStatus.draft,
                visibility=EntryVisibility.draft,
                ai_created=ai_created,
                provider_id=1,
            )
        )
        db.commit()


def _drop_ai_created(engine) -> None:
    """Simulate a volume created before ``ai_created`` existed (drop its index first for SQLite)."""
    with engine.begin() as conn:
        conn.execute(text("DROP INDEX IF EXISTS ix_catalog_entries_ai_created"))
        conn.execute(text("ALTER TABLE catalog_entries DROP COLUMN ai_created"))


def test_adds_missing_not_null_column_with_index(tmp_path):
    """A table predating ``ai_created`` gets the column (NOT NULL) and its index back."""
    engine = _engine(tmp_path)
    create_all(engine)
    _drop_ai_created(engine)
    assert "ai_created" not in {c["name"] for c in inspect(engine).get_columns("catalog_entries")}

    _reconcile_added_columns(engine)

    insp = inspect(engine)
    cols = {c["name"]: c for c in insp.get_columns("catalog_entries")}
    assert "ai_created" in cols
    assert cols["ai_created"]["nullable"] is False  # back-filled → NOT NULL kept
    index_names = {ix["name"] for ix in insp.get_indexes("catalog_entries")}
    assert "ix_catalog_entries_ai_created" in index_names  # indexed column restored


def test_insert_succeeds_after_reconcile(tmp_path):
    """The failure the finding describes: INSERT must not raise once the column is restored."""
    engine = _engine(tmp_path)
    create_all(engine)
    _add_entry(engine, "Old Entry", ai_created=False)  # pre-existing row on the old schema
    _drop_ai_created(engine)

    create_all(engine)  # exercises the reconcile path create_app runs on boot

    with make_sessionmaker(engine)() as db:
        # Existing row back-filled to the default (False); a fresh ORM insert now works.
        assert db.query(CatalogEntry).filter_by(title="Old Entry").one().ai_created is False
        db.add(
            CatalogEntry(
                type=CatalogType.event,
                title="New Entry",
                destination="Ireland",
                status=EntryStatus.draft,
                visibility=EntryVisibility.draft,
                ai_created=True,
                provider_id=1,
            )
        )
        db.commit()
        assert db.query(CatalogEntry).filter_by(title="New Entry").one().ai_created is True


def test_reconcile_is_idempotent_and_noop_on_fresh_db(tmp_path):
    """A freshly created schema needs no ALTERs; running reconcile twice changes nothing."""
    engine = _engine(tmp_path)
    create_all(engine)
    before = {c["name"] for c in inspect(engine).get_columns("catalog_entries")}

    _reconcile_added_columns(engine)
    _reconcile_added_columns(engine)

    after = {c["name"] for c in inspect(engine).get_columns("catalog_entries")}
    assert before == after


def test_str_default_column_backfilled_against_existing_rows(tmp_path):
    """A NOT NULL text column with a ``""`` default is restored and back-fills existing rows."""
    engine = _engine(tmp_path)
    create_all(engine)
    _add_entry(engine, "Has Rows", ai_created=False)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE catalog_entries DROP COLUMN review_reason"))

    _reconcile_added_columns(engine)

    cols = {c["name"]: c for c in inspect(engine).get_columns("catalog_entries")}
    assert "review_reason" in cols
    assert cols["review_reason"]["nullable"] is False
    with make_sessionmaker(engine)() as db:
        assert db.query(CatalogEntry).filter_by(title="Has Rows").one().review_reason == ""

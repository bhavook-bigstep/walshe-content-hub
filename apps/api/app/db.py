"""Database engine/session wiring.

Kept framework-light: ``create_app`` builds an engine from ``Settings`` and stashes a sessionmaker
on ``app.state`` so tests can inject an isolated in-memory SQLite engine (hermetic + deterministic,
Contract 4) without touching module globals.
"""

from __future__ import annotations

import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Dialect, Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import Column

from app.models.base import Base

logger = logging.getLogger(__name__)


def make_engine(database_url: str) -> Engine:
    """Create an Engine. SQLite needs ``check_same_thread=False`` for the TestClient thread pool."""
    connect_args = {}
    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_engine(database_url, connect_args=connect_args, future=True)


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def _render_scalar_default(column: Column, dialect: Dialect) -> str | None:
    """SQL literal for a column's Python-side scalar default, or None if it has none we can render.

    Only simple literals (bool/int/float/str) are rendered — enough to back-fill an additive
    NOT NULL column on a table that already holds rows. Anything else returns None so the caller
    falls back to adding the column as nullable (never a boot failure)."""
    default = column.default
    if default is None or not getattr(default, "is_scalar", False):
        return None
    value = default.arg
    if isinstance(value, bool):
        if dialect.name == "postgresql":
            return "true" if value else "false"
        return "1" if value else "0"  # sqlite stores BOOLEAN as 0/1
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return None


def _reconcile_added_columns(engine: Engine) -> None:
    """Additive-only schema reconciliation for the PoC (stand-in for Alembic).

    ``Base.metadata.create_all`` issues only ``CREATE TABLE IF NOT EXISTS`` — it never alters a
    table that already exists. So a newly mapped column (e.g. ``catalog_entries.ai_created``) is
    silently missing from a persisted Postgres volume created before the column was added, and every
    INSERT into that table then fails with ``column ... does not exist`` (Contract 4: reproducible
    builds would hold only on a freshly created DB). This closes that gap without the weight of a
    full migration tool: inspect each mapped table and ``ALTER TABLE ... ADD COLUMN`` for any mapped
    column the live table lacks. Strictly additive — it never drops, renames, or retypes a column —
    so it is safe and deterministic. A real deployment would own this with Alembic migrations.
    """
    dialect = engine.dialect
    with engine.begin() as conn:
        # Inspect on the SAME connection that runs the ALTERs so reflection and DDL never see
        # different schema snapshots (SQLite caches schema per connection).
        inspector = inspect(conn)
        existing_tables = set(inspector.get_table_names())
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # create_all just made it, with every mapped column
            live_columns = {c["name"] for c in inspector.get_columns(table.name)}
            added = False
            for column in table.columns:
                if column.name in live_columns:
                    continue
                try:
                    coltype = column.type.compile(dialect=dialect)
                except Exception:  # pragma: no cover - uncompilable type (e.g. abstract)
                    logger.warning(
                        "schema-reconcile: skip %s.%s (uncompilable type)",
                        table.name,
                        column.name,
                    )
                    continue
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {coltype}'
                default_sql = _render_scalar_default(column, dialect)
                if default_sql is not None:
                    ddl += f" DEFAULT {default_sql}"
                if not column.nullable:
                    if default_sql is None:
                        # No safe back-fill value: add as nullable rather than fail against rows.
                        logger.warning(
                            "schema-reconcile: add %s.%s as NULL (no back-fill default)",
                            table.name,
                            column.name,
                        )
                    else:
                        ddl += " NOT NULL"
                conn.execute(text(ddl))
                logger.info("schema-reconcile: added column %s.%s", table.name, column.name)
                added = True
            # Recreate any index the metadata defines but the live table lacks — a column added
            # above drops back in without its index otherwise (the finding's column is indexed).
            if added and table.indexes:
                live_indexes = {ix["name"] for ix in inspector.get_indexes(table.name)}
                for index in table.indexes:
                    if index.name not in live_indexes:
                        index.create(bind=conn, checkfirst=True)
                        logger.info("schema-reconcile: created index %s", index.name)


def create_all(engine: Engine) -> None:
    """Create tables for every registered model, then additively reconcile new columns.

    PoC stand-in for Alembic: ``create_all`` makes any missing table, and
    ``_reconcile_added_columns`` adds any mapped column missing from an already-existing table so a
    persisted volume survives a column-adding commit (Contract 4)."""
    # Import for side effect: registers all mappers on Base.metadata.
    import app.models  # noqa: F401

    Base.metadata.create_all(engine)
    _reconcile_added_columns(engine)

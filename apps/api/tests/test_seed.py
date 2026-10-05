"""AC17 — seed is idempotent and complete."""

from __future__ import annotations

from sqlalchemy import func, select

from app.models.catalog import CatalogEntry, EntryStatus
from app.models.user import Role, User
from app.seed import seed


def test_seed_is_idempotent_and_complete(settings):
    # Use a clean DB (no conftest users): build engine straight from settings.
    from app.db import create_all, make_engine, make_sessionmaker

    engine = make_engine(settings.database_url)
    create_all(engine)
    SessionLocal = make_sessionmaker(engine)

    with SessionLocal() as db:
        first = seed(db)
    with SessionLocal() as db:
        second = seed(db)

    assert first == second  # idempotent: identical counts on re-run

    with SessionLocal() as db:
        # One user per role.
        for role in Role:
            count = db.scalar(select(func.count()).select_from(User).where(User.role == role))
            assert count == 1
        # At least one approved, brand-safe entry exists (demo is runnable).
        approved = db.scalar(
            select(func.count())
            .select_from(CatalogEntry)
            .where(CatalogEntry.status == EntryStatus.approved, CatalogEntry.brand_safe.is_(True))
        )
        assert approved >= 1

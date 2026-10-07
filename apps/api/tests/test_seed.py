"""AC17 — seed is idempotent and complete."""

from __future__ import annotations

from sqlalchemy import func, select

from app.models.agent_features import Collection
from app.models.catalog import CatalogEntry, EntryStatus, ItemKind
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


def test_seed_creates_collections_and_image_items(settings):
    """AC84/AC88b — the baseline seed gives the agent browsable collections (references to visible
    entries) and each entry carries an accurate cover + image items (not only text)."""
    from app.db import create_all, make_engine, make_sessionmaker

    engine = make_engine(settings.database_url)
    create_all(engine)
    SessionLocal = make_sessionmaker(engine)
    with SessionLocal() as db:
        seed(db)

    with SessionLocal() as db:
        agent = db.scalar(select(User).where(User.role == Role.tourism_agent))
        cols = db.scalars(select(Collection).where(Collection.agent_id == agent.id)).all()
        names = {c.name for c in cols}
        assert {"West coast favourites", "Australia highlights"} <= names
        approved_ids = {
            e.id
            for e in db.scalars(
                select(CatalogEntry).where(CatalogEntry.status == EntryStatus.approved)
            ).all()
        }
        for c in cols:
            assert c.item_ids, f"collection {c.name} is empty"
            assert set(c.item_ids) <= approved_ids  # references only visible entries

        # Each seeded entry has a cover and at least one IMAGE item (gallery), plus its text items.
        entry = db.scalar(select(CatalogEntry).where(CatalogEntry.title == "Cliffs of Moher"))
        assert entry.cover_object_key, "entry should have a cover"
        kinds = [it.kind for it in entry.items]
        assert ItemKind.image in kinds, "entry should expose image items, not only text"
        assert ItemKind.text in kinds

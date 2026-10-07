"""Demo seed (make seed-demo) — idempotent and safe to run alongside the minimal app.seed."""

from __future__ import annotations

from sqlalchemy import func, select

from app.models.agent_features import Collection
from app.models.catalog import CatalogEntry, EntryStatus
from app.models.user import Role, User
from app.seed import seed
from app.seed_demo import seed_demo


def test_seed_demo_is_idempotent(settings):
    """Running it twice yields identical counts: upserts by natural key, no duplicates."""
    from app.db import create_all, make_engine, make_sessionmaker

    engine = make_engine(settings.database_url)
    create_all(engine)
    session_factory = make_sessionmaker(engine)

    with session_factory() as db:
        first = seed_demo(db)
    with session_factory() as db:
        second = seed_demo(db)
    assert first == second
    assert first["users"] == 4  # admin + provider + two agents
    assert first["entries"] == 9

    with session_factory() as db:
        agents = db.scalars(select(User).where(User.role == Role.tourism_agent)).all()
        assert len(agents) == 2


def test_seed_demo_creates_rich_named_collections(settings):
    """AC84 — the demo seeds several named, non-empty collections per agent, each referencing
    approved (agent-visible) catalog entries so a fresh workspace has real collections to open."""
    from app.db import create_all, make_engine, make_sessionmaker

    engine = make_engine(settings.database_url)
    create_all(engine)
    session_factory = make_sessionmaker(engine)
    with session_factory() as db:
        seed_demo(db)

    with session_factory() as db:
        agents = {
            u.email: u.id
            for u in db.scalars(select(User).where(User.role == Role.tourism_agent)).all()
        }
        approved_ids = {
            e.id
            for e in db.scalars(
                select(CatalogEntry).where(CatalogEntry.status == EntryStatus.approved)
            ).all()
        }

        def names(agent_id: int) -> dict[str, list[int]]:
            return {
                c.name: c.item_ids
                for c in db.scalars(
                    select(Collection).where(Collection.agent_id == agent_id)
                ).all()
            }

        agent1 = names(agents["agent@example.test"])
        agent2 = names(agents["agent2@example.test"])

        # Each agent has 3 named collections (one shared name is unique per agent).
        assert {"West coast favourites", "Honeymoon highlights", "Festival season"} <= set(agent1)
        assert {"City breaks", "Winter escapes", "Heritage & harbours"} <= set(agent2)

        # Every seeded collection is non-empty and points only at approved (visible) entries.
        for item_ids in {**agent1, **agent2}.values():
            assert item_ids, "a seeded collection should not be empty"
            assert set(item_ids) <= approved_ids


def test_seed_demo_coexists_with_minimal_seed(settings):
    """app.seed then seed_demo must not raise or duplicate the shared users."""
    from app.db import create_all, make_engine, make_sessionmaker

    engine = make_engine(settings.database_url)
    create_all(engine)
    session_factory = make_sessionmaker(engine)

    with session_factory() as db:
        seed(db)
    with session_factory() as db:
        seed_demo(db)  # must not raise (shared emails are upserted, not re-inserted)
    with session_factory() as db:
        for email in ("admin@example.test", "provider@example.test", "agent@example.test"):
            count = db.scalar(select(func.count()).select_from(User).where(User.email == email))
            assert count == 1

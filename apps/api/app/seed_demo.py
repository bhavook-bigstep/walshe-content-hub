"""Demo-ready seed: one board (provider) + two agents, with a rich, populated workspace.

Separate from the minimal ``app.seed`` (which tests + e2e depend on, one user per role). It builds a
walkthrough-ready dataset so the product looks alive in a demo: a structured catalog spanning every
type and lifecycle state (current, expiring-soon, expired, draft, in-review), plus each agent's
collections, saved projects, brand kit and a published post with engagement.

Idempotent (upserts by natural keys) and synthetic-only — no real people, secrets or PII. Run it
against the dev database with ``make seed-demo`` (or ``uv run python -m app.seed_demo``).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clock import now as clock_now
from app.models.agent_features import BrandKit, Collection
from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.composition import Composition
from app.models.engagement import Engagement
from app.models.post import Post, PostStatus
from app.models.user import Role, Tenant, User
from app.security import hash_password

_SALT = b"walsh-seed-salt0"  # fixed → deterministic demo credentials (dev only)
_PASSWORD = "demo-pass-0000"


def _tenant(db: Session) -> Tenant:
    t = db.execute(select(Tenant).where(Tenant.name == "Walsh Tourism Board")).scalar_one_or_none()
    if t is None:
        t = Tenant(name="Walsh Tourism Board")
        db.add(t)
        db.flush()
    t.blurb = "The national tourism board for Ireland's Wild Atlantic Way and beyond."
    t.markets = ["Ireland", "Australia", "New Zealand", "Germany"]
    t.verified = True
    return t


def _user(db: Session, email: str, role: Role, tenant_id: int | None, name: str, bio: str) -> User:
    u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if u is None:
        u = User(email=email, password_hash=hash_password(_PASSWORD, salt=_SALT), role=role)
        db.add(u)
    u.tenant_id = tenant_id
    u.approved = True
    u.display_name = name
    u.bio = bio
    return u


# (type, title, destination, status, days_valid_from, days_expires) — days relative to "now".
_ENTRIES: list[tuple[CatalogType, str, str, EntryStatus, int, int | None]] = [
    (
        CatalogType.event,
        "Harbour Festival",
        "Galway",
        EntryStatus.approved,
        -30,
        9,
    ),  # expiring soon
    (CatalogType.place, "Cliffs of Moher", "Clare", EntryStatus.approved, -60, None),
    (CatalogType.itinerary, "Wild Atlantic Way", "Mayo", EntryStatus.approved, -40, 120),
    (CatalogType.offer, "Autumn Escapes", "Kerry", EntryStatus.approved, -10, 60),
    (CatalogType.place, "Titanic Quarter", "Belfast", EntryStatus.approved, -20, 200),
    (CatalogType.event, "Dublin Lights", "Dublin", EntryStatus.approved, -5, 45),
    (
        CatalogType.opportunity,
        "Trade Showcase",
        "Dublin",
        EntryStatus.approved,
        -40,
        -10,
    ),  # expired
    (CatalogType.offer, "Winter Warmers", "Donegal", EntryStatus.draft, -2, 90),  # awaiting work
    (CatalogType.event, "Spring Food Fair", "Cork", EntryStatus.in_review, -1, 80),  # in review
]

_ATTRS: dict[CatalogType, dict] = {
    CatalogType.event: {
        "start_date": "2026-07-18",
        "venue": "Docklands",
        "expected_attendance": 40000,
    },
    CatalogType.place: {"region": "Wild Atlantic Way", "best_season": "Spring, Summer"},
    CatalogType.offer: {"price_from": 899, "currency": "EUR", "valid_until": "2026-11-30"},
    CatalogType.itinerary: {"duration_days": 7, "difficulty": "Easy"},
    CatalogType.opportunity: {"deadline": "2026-05-31", "commission": "12%"},
}


def _entry(db: Session, provider_id: int, spec, now: datetime) -> CatalogEntry:
    type_, title, dest, status, vf, ex = spec
    e = db.execute(
        select(CatalogEntry).where(
            CatalogEntry.provider_id == provider_id, CatalogEntry.title == title
        )
    ).scalar_one_or_none()
    if e is None:
        e = CatalogEntry(title=title, provider_id=provider_id)
        db.add(e)
    e.type = type_
    e.destination = dest
    e.description = (
        f"A verified {type_.value} in {dest}, ready for agents to personalise and share."
    )
    e.market_tags = ["leisure", "trade"]
    e.status = status
    e.brand_safe = status == EntryStatus.approved
    e.valid_from = now + timedelta(days=vf)
    e.expires_at = None if ex is None else now + timedelta(days=ex)
    e.attributes = _ATTRS.get(type_, {})
    e.highlights = [
        f"Signature {type_.value} on the Wild Atlantic Way",
        "Trade-ready assets included",
    ]
    e.custom_sections = [
        {"title": "Why agents love it", "body": f"A reliable, verified pick in {dest}."}
    ]
    db.flush()
    return e


def _brand_kit(db: Session, agent_id: int, **fields) -> None:
    kit = db.execute(select(BrandKit).where(BrandKit.agent_id == agent_id)).scalar_one_or_none()
    if kit is None:
        kit = BrandKit(agent_id=agent_id)
        db.add(kit)
    for k, v in fields.items():
        setattr(kit, k, v)


def _collection(db: Session, agent_id: int, name: str, item_ids: list[int]) -> None:
    c = db.execute(
        select(Collection).where(Collection.agent_id == agent_id, Collection.name == name)
    ).scalar_one_or_none()
    if c is None:
        c = Collection(agent_id=agent_id, name=name)
        db.add(c)
    c.item_ids = item_ids


def _composition(db: Session, agent_id: int, name: str, item_ids: list[int]) -> Composition:
    c = db.execute(
        select(Composition).where(Composition.agent_id == agent_id, Composition.name == name)
    ).scalar_one_or_none()
    if c is None:
        c = Composition(agent_id=agent_id, name=name, format="social", design={"nodes": []})
        db.add(c)
    c.item_ids = item_ids
    db.flush()
    return c


def _published_post(db: Session, composition_id: int, metrics: dict) -> None:
    post = db.execute(
        select(Post).where(Post.composition_id == composition_id, Post.channel == "facebook")
    ).scalar_one_or_none()
    when = datetime(2026, 1, 15, 9, 0, tzinfo=timezone.utc)
    if post is None:
        post = Post(composition_id=composition_id, channel="facebook")
        db.add(post)
    post.status = PostStatus.published
    post.scheduled_at = when
    post.published_at = when
    db.flush()
    if db.execute(select(Engagement.id).where(Engagement.post_id == post.id)).first() is None:
        db.add(Engagement(post_id=post.id, platform="instagram", metrics=metrics, fetched_at=when))


def seed_demo(db: Session) -> dict[str, int]:
    """Populate a demo-ready dataset idempotently. Returns row counts for verification."""
    now = clock_now()
    tenant = _tenant(db)
    _user(db, "admin@example.test", Role.super_admin, None, "Walsh Admin", "Platform operations.")
    provider = _user(
        db,
        "provider@example.test",
        Role.content_provider,
        tenant.id,
        "Dana Walsh",
        "Content lead at the Walsh Tourism Board.",
    )
    agent1 = _user(
        db,
        "agent@example.test",
        Role.tourism_agent,
        tenant.id,
        "Alex Rivera",
        "Independent agent selling Ireland to Australian honeymooners.",
    )
    agent2 = _user(
        db,
        "agent2@example.test",
        Role.tourism_agent,
        tenant.id,
        "Sam Doyle",
        "Marketing lead at a mid-sized agency focused on city breaks.",
    )
    db.flush()

    entries = [_entry(db, provider.id, spec, now) for spec in _ENTRIES]
    by_title = {e.title: e.id for e in entries}

    # Agent 1 (Alex): west-coast focus, a brand kit, a saved project + a live post.
    _brand_kit(
        db,
        agent1.id,
        primary_color="#0E6B5E",
        accent_color="#F3C96B",
        contact_name="Alex Rivera",
        contact_email="alex@riveratravel.example",
        website="riveratravel.example",
    )
    _collection(
        db,
        agent1.id,
        "West coast favourites",
        [by_title["Cliffs of Moher"], by_title["Wild Atlantic Way"]],
    )
    launch = _composition(
        db,
        agent1.id,
        "Galway launch post",
        [by_title["Harbour Festival"], by_title["Cliffs of Moher"]],
    )
    _published_post(
        db,
        launch.id,
        {"reach": 1200, "views": 1200, "likes": 90, "comments": 12,
         "saved": 20, "shares": 8, "total_interactions": 130},
    )

    # Agent 2 (Sam): city-breaks focus, a brand kit, a collection + a draft project.
    _brand_kit(
        db,
        agent2.id,
        primary_color="#1F3A5F",
        accent_color="#E06A63",
        contact_name="Sam Doyle",
        contact_email="sam@citybreaks.example",
        website="citybreaks.example",
    )
    _collection(
        db, agent2.id, "City breaks", [by_title["Dublin Lights"], by_title["Titanic Quarter"]]
    )
    _composition(db, agent2.id, "Dublin teaser", [by_title["Dublin Lights"]])

    db.commit()
    return {
        "users": db.scalar(select(func.count()).select_from(User)),
        "entries": db.scalar(select(func.count()).select_from(CatalogEntry)),
        "collections": db.scalar(select(func.count()).select_from(Collection)),
        "compositions": db.scalar(select(func.count()).select_from(Composition)),
    }


def _is_local(url: str) -> bool:
    return url.startswith("sqlite") or "localhost" in url or "127.0.0.1" in url


def main() -> None:
    import os

    from app.config import get_settings
    from app.db import create_all, make_engine, make_sessionmaker

    url = get_settings().database_url
    # Guard: these are known-password, pre-approved accounts (incl. a super admin). Never plant them
    # in a shared/production database by accident — require a local DB or an explicit override.
    if not _is_local(url) and os.environ.get("ALLOW_SEED_DEMO") != "1":
        raise SystemExit(
            "Refusing to seed demo accounts into a non-local database. "
            "Set ALLOW_SEED_DEMO=1 to override."
        )

    engine = make_engine(url)
    create_all(engine)
    session = make_sessionmaker(engine)()
    try:
        counts = seed_demo(session)
        agents = [
            u.email
            for u in session.execute(select(User).where(User.role == Role.tourism_agent)).scalars()
        ]
        print(f"[seed-demo] done: {counts}")
        print(
            f"[seed-demo] agents: {', '.join(sorted(agents))}  ·  provider: provider@example.test"
        )
        print(f"[seed-demo] all demo accounts use the password: {_PASSWORD}")
    finally:
        session.close()


if __name__ == "__main__":
    main()

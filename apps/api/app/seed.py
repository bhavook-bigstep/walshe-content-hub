"""Idempotent seed (AC17): one user per role + a synthetic catalog (every type) + a composition.

Upserts by stable natural keys (user email, entry (provider,title)) so running it twice yields the
same row counts — safe to re-run against the dev stack. Uses only synthetic, non-PII fixtures.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clock import now as clock_now
from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.composition import Composition
from app.models.engagement import Engagement
from app.models.post import Post, PostStatus
from app.models.user import Role, Tenant, User
from app.security import hash_password
from app.services.catalog_migration import decompose_entries_to_items, migrate_entries_to_catalogs

# A fixed salt keeps seeded password hashes deterministic across runs (dev/demo only).
_SEED_SALT = b"walsh-seed-salt0"

_SEED_USERS = [
    ("admin@example.test", Role.super_admin, True),
    ("provider@example.test", Role.content_provider, True),
    ("agent@example.test", Role.tourism_agent, True),
]

_SEED_ENTRIES = [
    (CatalogType.event, "Harbour Festival", "Galway"),
    (CatalogType.place, "Cliffs of Moher", "Clare"),
    (CatalogType.opportunity, "Trade Showcase", "Dublin"),
    (CatalogType.offer, "Autumn Package", "Kerry"),
    (CatalogType.itinerary, "Wild Atlantic Way", "Mayo"),
]

# Structured template attributes per type (AC29) — synthetic but schema-correct.
_SEED_ATTRIBUTES: dict[CatalogType, dict] = {
    CatalogType.event: {
        "start_date": "2026-07-18",
        "end_date": "2026-07-26",
        "venue": "Galway Docks",
        "expected_attendance": 40000,
    },
    CatalogType.place: {
        "region": "Wild Atlantic Way",
        "best_season": "Spring, Summer",
        "latitude": 52.9719,
        "longitude": -9.4261,
    },
    CatalogType.opportunity: {
        "deadline": "2026-05-31",
        "commission": "12%",
        "partner": "Aer Lingus",
    },
    CatalogType.offer: {
        "price_from": 899,
        "currency": "EUR",
        "valid_until": "2026-11-30",
    },
    CatalogType.itinerary: {
        "duration_days": 7,
        "stops": "Galway, Clifden, Westport, Sligo",
        "difficulty": "Easy",
    },
}


def _upsert_tenant(db: Session, name: str) -> Tenant:
    tenant = db.execute(select(Tenant).where(Tenant.name == name)).scalar_one_or_none()
    if tenant is None:
        tenant = Tenant(name=name)
        db.add(tenant)
        db.flush()
    return tenant


def _upsert_user(db: Session, email: str, role: Role, tenant_id: int | None) -> User:
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password("demo-pass-0000", salt=_SEED_SALT),
            role=role,
            tenant_id=tenant_id,
            approved=True,
        )
        db.add(user)
        db.flush()
    return user


def _upsert_entry(
    db: Session,
    provider_id: int,
    type_: CatalogType,
    title: str,
    destination: str,
    *,
    valid_from: datetime | None,
    expires_at: datetime | None,
) -> CatalogEntry:
    entry = db.execute(
        select(CatalogEntry).where(
            CatalogEntry.provider_id == provider_id, CatalogEntry.title == title
        )
    ).scalar_one_or_none()
    if entry is None:
        entry = CatalogEntry(
            type=type_,
            title=title,
            description=f"Seeded {type_.value} in {destination}.",
            destination=destination,
            market_tags=["leisure"],
            status=EntryStatus.approved,
            brand_safe=True,
            valid_from=valid_from,
            expires_at=expires_at,
            provider_id=provider_id,
            attributes=_SEED_ATTRIBUTES.get(type_, {}),
            highlights=[
                f"Signature {type_.value} on the Wild Atlantic Way",
                "Trade-ready assets included",
            ],
            custom_sections=[
                {
                    "title": "Why agents love it",
                    "body": f"A reliable, verified {type_.value} in {destination}.",
                }
            ],
        )
        db.add(entry)
        db.flush()
    return entry


def _upsert_composition(db: Session, agent_id: int, name: str, item_ids: list[int]) -> Composition:
    """Upsert a saved composition by (agent, name) so the seed stays idempotent (AC17)."""
    comp = db.execute(
        select(Composition).where(Composition.agent_id == agent_id, Composition.name == name)
    ).scalar_one_or_none()
    if comp is None:
        comp = Composition(
            agent_id=agent_id,
            name=name,
            format="social",
            item_ids=item_ids,
            design={"nodes": []},
        )
        db.add(comp)
        db.flush()
    return comp


_SEED_CHANNEL = "facebook"
_SEED_PUBLISHED_AT = datetime(2026, 1, 15, 9, 0, tzinfo=timezone.utc)  # fixed => deterministic
_SEED_METRICS = {"impressions": 1200, "clicks": 84, "engagement": 150}  # synthetic


def _upsert_post_with_engagement(db: Session, composition_id: int) -> None:
    post = db.execute(
        select(Post).where(Post.composition_id == composition_id, Post.channel == _SEED_CHANNEL)
    ).scalar_one_or_none()
    if post is None:
        post = Post(
            composition_id=composition_id,
            channel=_SEED_CHANNEL,
            status=PostStatus.published,
            scheduled_at=_SEED_PUBLISHED_AT,
            published_at=_SEED_PUBLISHED_AT,
        )
        db.add(post)
        db.flush()
    has_metrics = db.execute(select(Engagement.id).where(Engagement.post_id == post.id)).first()
    if has_metrics is None:
        db.add(Engagement(post_id=post.id, **_SEED_METRICS))


_SEED_DISPLAY_NAMES = {
    Role.super_admin: "Walsh Admin",
    Role.content_provider: "Dana Walsh",
    Role.tourism_agent: "Alex Rivera",
}


def seed(db: Session) -> dict[str, int]:
    """Populate the database idempotently. Returns row counts for verification."""
    tenant = _upsert_tenant(db, "Walsh Tourism Board")
    # Organization profile (AC27) — a verified board with markets.
    tenant.blurb = "The national tourism board for Ireland's Wild Atlantic Way and beyond."
    tenant.markets = ["Ireland", "Australia", "New Zealand"]
    tenant.verified = True

    users = {
        role: _upsert_user(db, email, role, tenant.id if role != Role.super_admin else None)
        for email, role, _ in _SEED_USERS
    }
    for role, user in users.items():
        if not user.display_name:
            user.display_name = _SEED_DISPLAY_NAMES[role]
    provider = users[Role.content_provider]
    agent = users[Role.tourism_agent]

    # Demo-legible validity windows (AC32/AC33) derived from a single clock source. "Harbour
    # Festival" expires soon; "Trade Showcase" is already expired (auto-withdrawn on its own); the
    # rest are open-ended current content.
    t = clock_now()
    _SEED_VALIDITY: dict[str, tuple[datetime | None, datetime | None]] = {
        "Harbour Festival": (t - timedelta(days=30), t + timedelta(days=5)),
        "Trade Showcase": (t - timedelta(days=40), t - timedelta(days=10)),
    }
    entries = [
        _upsert_entry(
            db,
            provider.id,
            type_,
            title,
            dest,
            valid_from=_SEED_VALIDITY.get(title, (t - timedelta(days=30), None))[0],
            expires_at=_SEED_VALIDITY.get(title, (t - timedelta(days=30), None))[1],
        )
        for type_, title, dest in _SEED_ENTRIES
    ]

    # A healthy composition (current items) and one that will fail preflight (holds the expired
    # "Trade Showcase") so the pre-send check (AC34) has something to catch in the demo.
    launch_comp = _upsert_composition(
        db, agent.id, "Galway launch post", [entries[0].id, entries[1].id]
    )
    _upsert_composition(db, agent.id, "Trade Showcase teaser", [entries[2].id])

    _upsert_post_with_engagement(db, launch_comp.id)

    # AC49/AC50: move seeded entries into per-provider catalogs and decompose them into items, so
    # the catalog library is populated and the migration runs on a real path (not only in tests).
    migrate_entries_to_catalogs(db)
    decompose_entries_to_items(db)

    db.commit()

    return {
        "users": db.scalar(select(func.count()).select_from(User)),
        "entries": db.scalar(select(func.count()).select_from(CatalogEntry)),
        "compositions": db.scalar(select(func.count()).select_from(Composition)),
        "posts": db.scalar(select(func.count()).select_from(Post)),
        "engagement": db.scalar(select(func.count()).select_from(Engagement)),
    }

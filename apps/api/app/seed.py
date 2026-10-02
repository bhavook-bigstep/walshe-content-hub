"""Idempotent seed (AC17): one user per role + a synthetic catalog (every type) + a composition.

Upserts by stable natural keys (user email, entry (provider,title)) so running it twice yields the
same row counts — safe to re-run against the dev stack. Uses only synthetic, non-PII fixtures.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.composition import Composition
from app.models.engagement import Engagement
from app.models.post import Post, PostStatus
from app.models.user import Role, Tenant, User
from app.security import hash_password

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
    db: Session, provider_id: int, type_: CatalogType, title: str, destination: str
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
            provider_id=provider_id,
        )
        db.add(entry)
        db.flush()
    return entry


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

    entries = [
        _upsert_entry(db, provider.id, type_, title, dest) for type_, title, dest in _SEED_ENTRIES
    ]

    existing_comp = db.execute(
        select(Composition).where(Composition.agent_id == agent.id)
    ).scalar_one_or_none()
    if existing_comp is None:
        existing_comp = Composition(
            agent_id=agent.id, format="social", item_ids=[entries[0].id, entries[1].id]
        )
        db.add(existing_comp)
        db.flush()

    _upsert_post_with_engagement(db, existing_comp.id)

    db.commit()

    return {
        "users": db.scalar(select(func.count()).select_from(User)),
        "entries": db.scalar(select(func.count()).select_from(CatalogEntry)),
        "compositions": db.scalar(select(func.count()).select_from(Composition)),
        "posts": db.scalar(select(func.count()).select_from(Post)),
        "engagement": db.scalar(select(func.count()).select_from(Engagement)),
    }

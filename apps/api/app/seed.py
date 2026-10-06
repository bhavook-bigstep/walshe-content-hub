"""Idempotent seed (AC17): one user per role + a synthetic catalog (every type) + a composition.

Upserts by stable natural keys (user email, entry (provider,title)) so running it twice yields the
same row counts — safe to re-run against the dev stack. Uses only synthetic, non-PII fixtures.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clock import now as clock_now
from app.models.catalog import (
    Catalog,
    CatalogEntry,
    CatalogType,
    CatalogVisibility,
    EntryStatus,
    EntryVisibility,
    Season,
)
from app.models.composition import Composition
from app.models.engagement import Engagement
from app.models.post import Post
from app.models.user import Role, Tenant, User
from app.security import hash_password
from app.services.catalog_migration import decompose_entries_to_items

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

# Structured location + season per entry (AC53) — values come from the curated geo hierarchy
# (app/geo.py) so the agent catalog's cascading filters have real, matching options.
# title -> (country, state, city, season)
_SEED_LOCATION: dict[str, tuple[str, str, str, Season]] = {
    "Harbour Festival": ("Ireland", "Galway", "Galway City", Season.summer),
    "Cliffs of Moher": ("Ireland", "Clare", "Doolin", Season.year_round),
    "Trade Showcase": ("Ireland", "Dublin", "Dublin", Season.autumn),
    "Autumn Package": ("Ireland", "Kerry", "Killarney", Season.autumn),
    "Wild Atlantic Way": ("Ireland", "Mayo", "Westport", Season.summer),
}

# Per-entry distribution (AC54): most of the demo catalog is public; "Autumn Package" is private
# to showcase the invited-agents set (the seeded agent is invited on the catalog below).
_SEED_VISIBILITY: dict[str, EntryVisibility] = {
    "Autumn Package": EntryVisibility.private,
}

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


def _upsert_catalog(db: Session, provider_id: int, display_name: str) -> Catalog:
    """The provider's single public catalog (AC49) — one per provider, public so every agent can
    browse it in the demo. Idempotent: matched by provider, so re-running the seed reuses it."""
    catalog = db.execute(
        select(Catalog).where(Catalog.provider_id == provider_id).order_by(Catalog.id)
    ).scalars().first()
    if catalog is None:
        catalog = Catalog(
            provider_id=provider_id,
            name=f"{display_name} catalog",
            category="Destination content",
            visibility=CatalogVisibility.public,
            shared_agent_ids=[],
        )
        db.add(catalog)
        db.flush()
    return catalog


def _upsert_entry(
    db: Session,
    provider_id: int,
    catalog_id: int,
    type_: CatalogType,
    title: str,
    destination: str,
    *,
    valid_from: datetime | None,
    expires_at: datetime | None,
    created_by_email: str = "",
    org_name: str = "",
) -> CatalogEntry:
    entry = db.execute(
        select(CatalogEntry).where(
            CatalogEntry.provider_id == provider_id, CatalogEntry.title == title
        )
    ).scalar_one_or_none()
    country, state, city, season = _SEED_LOCATION.get(title, ("Ireland", destination, "", None))
    if entry is None:
        entry = CatalogEntry(
            type=type_,
            title=title,
            description=f"Seeded {type_.value} in {destination}.",
            destination=destination,
            country=country,
            state=state,
            city=city,
            season=season,
            visibility=_SEED_VISIBILITY.get(title, EntryVisibility.public),
            market_tags=["leisure"],
            status=EntryStatus.approved,
            brand_safe=True,
            valid_from=valid_from,
            expires_at=expires_at,
            provider_id=provider_id,
            created_by_email=created_by_email,
            org_name=org_name,
            catalog_id=catalog_id,
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


# No seeded engagement/posts: the dashboard shows real metrics only (its designed empty state
# until an agent actually publishes), rather than synthetic numbers that read as a real result.

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
    # AC49: the provider owns a single public catalog; every seeded entry lives in it.
    catalog = _upsert_catalog(db, provider.id, provider.display_name or "Dana Walsh")
    entries = [
        _upsert_entry(
            db,
            provider.id,
            catalog.id,
            type_,
            title,
            dest,
            valid_from=_SEED_VALIDITY.get(title, (t - timedelta(days=30), None))[0],
            expires_at=_SEED_VALIDITY.get(title, (t - timedelta(days=30), None))[1],
            created_by_email=provider.email,
            org_name=tenant.name,
        )
        for type_, title, dest in _SEED_ENTRIES
    ]

    # AC54: invite the demo agent on the catalog so the one private entry ("Autumn Package") is
    # visible to them — showcasing the invited-agents set alongside the public set.
    catalog.shared_agent_ids = [agent.id]

    # A healthy composition (current items) and one that will fail preflight (holds the expired
    # "Trade Showcase") so the pre-send check (AC34) has something to catch in the demo.
    _upsert_composition(db, agent.id, "Galway launch post", [entries[0].id, entries[1].id])
    _upsert_composition(db, agent.id, "Trade Showcase teaser", [entries[2].id])

    # AC50: decompose each entry's text + assets into first-class items so the catalog library and
    # the studio media picker are populated.
    decompose_entries_to_items(db)

    db.commit()

    return {
        "users": db.scalar(select(func.count()).select_from(User)),
        "entries": db.scalar(select(func.count()).select_from(CatalogEntry)),
        "compositions": db.scalar(select(func.count()).select_from(Composition)),
        "posts": db.scalar(select(func.count()).select_from(Post)),
        "engagement": db.scalar(select(func.count()).select_from(Engagement)),
    }

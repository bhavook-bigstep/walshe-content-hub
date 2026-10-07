"""Idempotent seed (AC17): one user per role + a synthetic catalog (every type) + a composition.

Upserts by stable natural keys (user email, entry (provider,title)) so running it twice yields the
same row counts — safe to re-run against the dev stack. Uses only synthetic, non-PII fixtures.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clock import now as clock_now
from app.models.agent_features import Collection
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
from app.models.post import Post, PostStatus
from app.models.user import Role, Tenant, User
from app.security import hash_password
from app.services.catalog_migration import decompose_entries_to_items
from app.services.seed_images import seed_covers

# A fixed salt keeps seeded password hashes deterministic across runs (dev/demo only).
_SEED_SALT = b"walsh-seed-salt0"

_SEED_USERS = [
    ("admin@example.test", Role.super_admin, True),
    ("provider@example.test", Role.content_provider, True),
    ("agent@example.test", Role.tourism_agent, True),
]

_SEED_ENTRIES = [
    # Ireland
    (CatalogType.event, "Harbour Festival", "Galway"),
    (CatalogType.place, "Cliffs of Moher", "Clare"),
    (CatalogType.opportunity, "Trade Showcase", "Dublin"),
    (CatalogType.offer, "Autumn Package", "Kerry"),
    (CatalogType.itinerary, "Wild Atlantic Way", "Mayo"),
    # Australia
    (CatalogType.event, "Vivid Sydney", "New South Wales"),
    (CatalogType.place, "Great Barrier Reef", "Queensland"),
    (CatalogType.opportunity, "Australian Trade Expo", "Victoria"),
    (CatalogType.offer, "Red Centre Getaway", "Northern Territory"),
    (CatalogType.itinerary, "Great Ocean Road Drive", "Victoria"),
    # Australia — more places
    (CatalogType.place, "Sydney Opera House", "New South Wales"),
    (CatalogType.place, "Uluru-Kata Tjuta", "Northern Territory"),
    (CatalogType.place, "Daintree Rainforest", "Queensland"),
    (CatalogType.place, "Twelve Apostles", "Victoria"),
    (CatalogType.place, "Rottnest Island", "Western Australia"),
    # Australia — more events
    (CatalogType.event, "Melbourne Cup", "Victoria"),
    (CatalogType.event, "Sydney New Year's Eve", "New South Wales"),
    (CatalogType.event, "Australian Open", "Victoria"),
    (CatalogType.event, "Darwin Festival", "Northern Territory"),
    (CatalogType.event, "Byron Bay Bluesfest", "New South Wales"),
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
    "Vivid Sydney": ("Australia", "New South Wales", "Sydney", Season.winter),
    "Great Barrier Reef": ("Australia", "Queensland", "Cairns", Season.year_round),
    "Australian Trade Expo": ("Australia", "Victoria", "Melbourne", Season.spring),
    "Red Centre Getaway": ("Australia", "Northern Territory", "Alice Springs", Season.winter),
    "Great Ocean Road Drive": ("Australia", "Victoria", "Geelong", Season.summer),
    "Sydney Opera House": ("Australia", "New South Wales", "Sydney", Season.year_round),
    "Uluru-Kata Tjuta": ("Australia", "Northern Territory", "Uluru", Season.year_round),
    "Daintree Rainforest": ("Australia", "Queensland", "Port Douglas", Season.year_round),
    "Twelve Apostles": ("Australia", "Victoria", "Great Ocean Road", Season.year_round),
    "Rottnest Island": ("Australia", "Western Australia", "Perth", Season.summer),
    "Melbourne Cup": ("Australia", "Victoria", "Melbourne", Season.spring),
    "Sydney New Year's Eve": ("Australia", "New South Wales", "Sydney", Season.summer),
    "Australian Open": ("Australia", "Victoria", "Melbourne", Season.summer),
    "Darwin Festival": ("Australia", "Northern Territory", "Darwin", Season.winter),
    "Byron Bay Bluesfest": ("Australia", "New South Wales", "Byron Bay", Season.autumn),
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

# Per-entry attribute overrides (take precedence over the per-type defaults above) so each
# destination reads true — e.g. Australian offers price in AUD, events name local venues.
_SEED_ATTRIBUTES_BY_TITLE: dict[str, dict] = {
    "Vivid Sydney": {
        "start_date": "2026-05-22",
        "end_date": "2026-06-13",
        "venue": "Sydney Harbour & CBD",
        "expected_attendance": 2000000,
    },
    "Great Barrier Reef": {
        "region": "Coral Sea",
        "latitude": -16.9203,
        "longitude": 145.7710,
    },
    "Australian Trade Expo": {
        "deadline": "2026-08-15",
        "commission": "10%",
        "partner": "Qantas",
    },
    "Red Centre Getaway": {
        "price_from": 1490,
        "currency": "AUD",
        "valid_until": "2026-10-31",
    },
    "Great Ocean Road Drive": {
        "duration_days": 5,
        "stops": "Geelong, Torquay, Apollo Bay, Twelve Apostles, Port Campbell",
        "difficulty": "Easy",
    },
    # Australian places
    "Sydney Opera House": {"region": "Sydney Harbour", "latitude": -33.8568, "longitude": 151.2153},
    "Uluru-Kata Tjuta": {"region": "Red Centre", "latitude": -25.3444, "longitude": 131.0369},
    "Daintree Rainforest": {
        "region": "Tropical North Queensland",
        "latitude": -16.1700,
        "longitude": 145.4185,
    },
    "Twelve Apostles": {"region": "Great Ocean Road", "latitude": -38.6662, "longitude": 143.1044},
    "Rottnest Island": {"region": "Perth & Rottnest", "latitude": -31.9969, "longitude": 115.5400},
    # Australian events
    "Melbourne Cup": {
        "start_date": "2026-11-03",
        "end_date": "2026-11-03",
        "venue": "Flemington Racecourse",
        "expected_attendance": 100000,
    },
    "Sydney New Year's Eve": {
        "start_date": "2026-12-31",
        "end_date": "2027-01-01",
        "venue": "Sydney Harbour",
        "expected_attendance": 1000000,
    },
    "Australian Open": {
        "start_date": "2027-01-18",
        "end_date": "2027-02-01",
        "venue": "Melbourne Park",
        "expected_attendance": 900000,
    },
    "Darwin Festival": {
        "start_date": "2026-08-06",
        "end_date": "2026-08-23",
        "venue": "Darwin city venues",
        "expected_attendance": 200000,
    },
    "Byron Bay Bluesfest": {
        "start_date": "2027-04-01",
        "end_date": "2027-04-05",
        "venue": "Byron Events Farm",
        "expected_attendance": 100000,
    },
}

# Real editorial copy per entry (description + highlights) so the catalog reads like genuine
# destination content, not placeholder/demo text. title -> {description, highlights:[...]}.
_SEED_CONTENT: dict[str, dict] = {
    "Harbour Festival": {
        "description": "A week of waterfront music, street theatre and seafood on Galway's historic"
        " docks, drawing crowds from across the west of Ireland.",
        "highlights": [
            "Live music across five harbourside stages",
            "Local seafood and craft markets",
            "Family-friendly daytime programme",
        ],
    },
    "Cliffs of Moher": {
        "description": "Rising 214 metres above the Atlantic, the Cliffs of Moher are Ireland's"
        " most visited natural attraction, with views to the Aran Islands and the open ocean.",
        "highlights": [
            "214m sea cliffs with viewing platforms",
            "O'Brien's Tower and visitor centre",
            "Signposted coastal walking trails",
        ],
    },
    "Trade Showcase": {
        "description": "An invitation-only trade showcase connecting Irish destination partners"
        " with international travel agents ahead of the new season.",
        "highlights": [
            "Meet destination suppliers face to face",
            "Pre-scheduled one-to-one meetings",
            "Commission and incentive deals",
        ],
    },
    "Autumn Package": {
        "description": "A three-night autumn escape in Killarney with guided Ring of Kerry touring,"
        " National Park access and a traditional music evening.",
        "highlights": [
            "Three nights with breakfast",
            "Guided Ring of Kerry day tour",
            "Entry to Killarney National Park",
        ],
    },
    "Wild Atlantic Way": {
        "description": "A seven-day self-drive along Ireland's western seaboard, from Galway's bays"
        " through Connemara to the cliffs and islands of Mayo.",
        "highlights": [
            "Seven days, flexible self-drive",
            "Connemara, Westport and Achill Island",
            "Curated stops and local stays",
        ],
    },
    "Vivid Sydney": {
        "description": "Vivid Sydney transforms the harbour city with large-scale light"
        " installations, live music and ideas talks across three winter weeks.",
        "highlights": [
            "City-wide light art and projections",
            "Live music programme",
            "Harbour foreshore light walk",
        ],
    },
    "Great Barrier Reef": {
        "description": "The world's largest coral reef system stretches more than 2,300 kilometres"
        " off the Queensland coast, with snorkelling, diving and reef cruises from Cairns and Port"
        " Douglas.",
        "highlights": [
            "World Heritage-listed coral reef",
            "Snorkel and dive day trips",
            "Departures from Cairns and Port Douglas",
        ],
    },
    "Australian Trade Expo": {
        "description": "A national travel trade expo in Melbourne connecting Australian destination"
        " partners with agents and tour operators for the year ahead.",
        "highlights": [
            "National network of suppliers",
            "Scheduled trade appointments",
            "Partner incentives and famils",
        ],
    },
    "Red Centre Getaway": {
        "description": "A four-night Red Centre package based in Alice Springs with Uluru sunrise"
        " touring, Kings Canyon and a desert dinner under the stars.",
        "highlights": [
            "Four nights with daily breakfast",
            "Uluru sunrise and base walk",
            "Kings Canyon rim walk",
        ],
    },
    "Great Ocean Road Drive": {
        "description": "A five-day coastal drive from Geelong past Bells Beach and Apollo Bay"
        " to the Twelve Apostles, with rainforest and surf-town stops along the way.",
        "highlights": [
            "Five-day self-drive itinerary",
            "Twelve Apostles and Loch Ard Gorge",
            "Otways rainforest and coastal towns",
        ],
    },
    "Sydney Opera House": {
        "description": "A UNESCO World Heritage masterpiece on Sydney Harbour, hosting opera,"
        " theatre and concerts beneath its iconic sails.",
        "highlights": [
            "Guided architecture tours",
            "Year-round performance programme",
            "Harbourside dining",
        ],
    },
    "Uluru-Kata Tjuta": {
        "description": "A vast sandstone monolith sacred to the Anangu people, Uluru anchors a"
        " desert national park of dramatic sunrises, sunsets and ancient rock art.",
        "highlights": [
            "Uluru base walk and rock art",
            "Kata Tjuta (The Olgas) trails",
            "Sunrise and sunset viewing",
        ],
    },
    "Daintree Rainforest": {
        "description": "One of the oldest living rainforests on earth, the Daintree meets the reef"
        " north of Port Douglas, with boardwalks, river cruises and abundant wildlife.",
        "highlights": [
            "Ancient World Heritage rainforest",
            "Daintree River wildlife cruises",
            "Where rainforest meets the reef",
        ],
    },
    "Twelve Apostles": {
        "description": "Towering limestone stacks rising from the Southern Ocean along Victoria's"
        " Great Ocean Road, best seen at sunrise and sunset.",
        "highlights": [
            "Iconic limestone sea stacks",
            "Boardwalk lookouts",
            "Sunrise and sunset photography",
        ],
    },
    "Rottnest Island": {
        "description": "A car-free island off Perth known for quokkas, white-sand bays and clear"
        " snorkelling waters, reached by a short ferry.",
        "highlights": [
            "Home of the quokka",
            "Cycle and snorkel the bays",
            "Short ferry from Perth and Fremantle",
        ],
    },
    "Melbourne Cup": {
        "description": "The race that stops a nation, Australia's premier thoroughbred race draws a"
        " global crowd to Flemington on the first Tuesday of November.",
        "highlights": [
            "Group 1 feature race",
            "Fashions on the Field",
            "Flemington trackside hospitality",
        ],
    },
    "Sydney New Year's Eve": {
        "description": "Sydney's harbour fireworks are among the world's first and largest New Year"
        " celebrations, viewed from foreshores around the Opera House and bridge.",
        "highlights": [
            "Harbour Bridge midnight fireworks",
            "9pm family fireworks",
            "Foreshore vantage points",
        ],
    },
    "Australian Open": {
        "description": "The year's first tennis Grand Slam brings the world's top players to"
        " Melbourne Park across two weeks of summer.",
        "highlights": [
            "Grand Slam main draw",
            "Rod Laver Arena sessions",
            "Festival precinct and live sites",
        ],
    },
    "Darwin Festival": {
        "description": "An open-air arts festival celebrating Top End music, theatre and food"
        " through Darwin's balmy dry-season evenings.",
        "highlights": [
            "Open-air music and theatre",
            "Top End food and markets",
            "Dry-season evening programme",
        ],
    },
    "Byron Bay Bluesfest": {
        "description": "A long-running roots and blues festival staged over the Easter long weekend"
        " at the Byron Events Farm.",
        "highlights": [
            "Roots, blues and world music",
            "Multiple stages over five days",
            "Easter long weekend",
        ],
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
    content = _SEED_CONTENT.get(title, {})
    place = city or state or country
    if entry is None:
        entry = CatalogEntry(
            type=type_,
            title=title,
            description=content.get("description", f"{title} in {place}."),
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
            attributes=_SEED_ATTRIBUTES_BY_TITLE.get(title, _SEED_ATTRIBUTES.get(type_, {})),
            highlights=content.get("highlights", []),
            custom_sections=[],
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


def _upsert_collection(db: Session, agent_id: int, name: str, item_ids: list[int]) -> Collection:
    """Upsert a saved collection by (agent, name) so the seed stays idempotent (AC84)."""
    c = db.execute(
        select(Collection).where(Collection.agent_id == agent_id, Collection.name == name)
    ).scalar_one_or_none()
    if c is None:
        c = Collection(agent_id=agent_id, name=name)
        db.add(c)
    c.item_ids = item_ids
    db.flush()
    return c


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
    launch_comp = _upsert_composition(
        db, agent.id, "Galway launch post", [entries[0].id, entries[1].id]
    )
    _upsert_composition(db, agent.id, "Trade Showcase teaser", [entries[2].id])

    # Saved collections the agent can browse immediately (AC84) — references to existing, visible
    # catalog entries (no copies). by_title maps entry titles to ids.
    by_title = {e.title: e.id for e in entries}

    def _pick(*titles: str) -> list[int]:
        return [by_title[t] for t in titles if t in by_title]

    _upsert_collection(
        db, agent.id, "West coast favourites",
        _pick("Cliffs of Moher", "Wild Atlantic Way", "Harbour Festival"),
    )
    _upsert_collection(
        db, agent.id, "Australia highlights",
        _pick("Great Barrier Reef", "Sydney Opera House", "Great Ocean Road Drive"),
    )

    _upsert_post_with_engagement(db, launch_comp.id)

    # AC4/AC17: give every entry a real cover image in object storage (MinIO / the on-disk store),
    # so the catalog is photo-led and the Design Studio has genuine, droppable media. Done before
    # decompose so each cover becomes an image item too.
    seed_covers(db, entries)

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

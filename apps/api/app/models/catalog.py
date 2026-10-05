"""Catalog entry + asset models (AC3/AC4/AC5/AC6).

Access scoping (``allowed_tenant_ids`` / ``allowed_agent_ids``) plus ``status`` and ``brand_safe``
are the data behind Contract 1 — enforced in one place by ``app.services.visibility``.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base


class CatalogType(str, enum.Enum):
    event = "event"
    place = "place"
    opportunity = "opportunity"
    offer = "offer"
    itinerary = "itinerary"


class EntryStatus(str, enum.Enum):
    """Stored lifecycle status (AC32). ``expiring_soon`` / ``expired`` are never stored — they are
    derived at read time (see ``app.lifecycle``)."""

    draft = "draft"
    in_review = "in_review"
    approved = "approved"
    withdrawn = "withdrawn"


class DisplayStatus(str, enum.Enum):
    """Status actually shown to users (AC32): the stored values plus the two derived ones."""

    draft = "draft"
    in_review = "in_review"
    approved = "approved"
    expiring_soon = "expiring_soon"
    expired = "expired"
    withdrawn = "withdrawn"


class CatalogVisibility(str, enum.Enum):
    """A catalog's distribution gate (AC49): public = every agent; private = only shared agents."""

    public = "public"
    private = "private"


class Season(str, enum.Enum):
    """The fixed season list (AC53) — a closed vocabulary so it works as a catalog filter."""

    spring = "spring"
    summer = "summer"
    autumn = "autumn"
    winter = "winter"
    year_round = "year_round"


class EntryVisibility(str, enum.Enum):
    """Per-entry distribution within a catalog (AC54): the three sets a provider sorts entries into.

    draft   = work in progress, visible to no agent (the default for a new entry);
    public  = visible to every agent;
    private = visible only to the agents invited on the entry's catalog (``shared_agent_ids``).
    """

    draft = "draft"
    public = "public"
    private = "private"


class Catalog(Base):
    """A provider-owned catalog (AC49). Catalog-level public/private + sharing is the single gate
    that decides whether an agent may use the catalog's entries + items (Contract 1, re-based from
    per-entry approval to catalog publish/share)."""

    __tablename__ = "catalogs"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(120), default="")
    visibility: Mapped[CatalogVisibility] = mapped_column(
        Enum(CatalogVisibility), default=CatalogVisibility.private
    )
    # Agent ids a private catalog is shared with (empty for public, where it is ignored).
    shared_agent_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now()
    )

    entries: Mapped[list["CatalogEntry"]] = relationship(back_populates="catalog")

    def is_accessible_to_agent(self, agent_id: int) -> bool:
        """Catalog-level gate: public to all, else only to agents it is shared with."""
        if self.visibility == CatalogVisibility.public:
            return True
        return agent_id in (self.shared_agent_ids or [])


class CatalogEntry(Base):
    __tablename__ = "catalog_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    # The owning catalog (AC49). Nullable only as a migration bridge; the visibility choke-point
    # treats a catalog-less entry by the legacy approved+brand-safe gate until it is migrated.
    catalog_id: Mapped[int | None] = mapped_column(
        ForeignKey("catalogs.id"), nullable=True, index=True
    )
    type: Mapped[CatalogType] = mapped_column(Enum(CatalogType))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    destination: Mapped[str] = mapped_column(String(200), index=True)
    # Structured location (AC53) — drives the agent catalog's cascading country/state/city filters.
    # `destination` stays as the human label (auto-composed from these in the UI).
    country: Mapped[str] = mapped_column(String(120), default="", index=True)
    state: Mapped[str] = mapped_column(String(120), default="", index=True)
    city: Mapped[str] = mapped_column(String(120), default="", index=True)
    # Season as a closed vocabulary (AC53) so it filters cleanly; optional.
    season: Mapped[Season | None] = mapped_column(Enum(Season), nullable=True, index=True)
    # Per-entry distribution (AC54): draft (default, hidden) · public (all agents) · private
    # (only agents invited on the catalog). This is the Contract-1 gate for catalog entries.
    visibility: Mapped[EntryVisibility] = mapped_column(
        Enum(EntryVisibility), default=EntryVisibility.draft, index=True
    )
    market_tags: Mapped[list[str]] = mapped_column(JSON, default=list)

    # Structured inventory (AC29) — explicit, typed data so AI agents can crawl it reliably.
    # `attributes` holds the per-type template fields ({field_key: value}); `highlights` are
    # structured selling points; `custom_sections` capture anything outside the template as
    # titled rich blocks ([{title, body}]).
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    highlights: Mapped[list[str]] = mapped_column(JSON, default=list)
    custom_sections: Mapped[list[dict]] = mapped_column(JSON, default=list)

    # Cover photo (AC52): the entry's card image — uploaded or AI-generated. Stored key under
    # ``entries/{id}/cover/``; empty means the UI falls back to a media asset or a placeholder.
    cover_object_key: Mapped[str] = mapped_column(String(512), default="")
    cover_content_type: Mapped[str] = mapped_column(String(128), default="")

    status: Mapped[EntryStatus] = mapped_column(Enum(EntryStatus), default=EntryStatus.draft)
    brand_safe: Mapped[bool] = mapped_column(Boolean, default=False)
    # Reviewer's reason when an item is sent back to its owner (AC35); cleared on re-approval.
    review_reason: Mapped[str] = mapped_column(Text, default="")
    # Validity window (AC32) — both nullable; display status derives from `expires_at` vs. clock.
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Bumped on every master content edit (AC33) so in-use copies can be flagged as stale.
    content_version: Mapped[int] = mapped_column(default=1)
    # Empty lists == open to all approved+brand-safe viewers; non-empty == restricted scope.
    allowed_tenant_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    allowed_agent_ids: Mapped[list[int]] = mapped_column(JSON, default=list)

    provider_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    catalog: Mapped["Catalog | None"] = relationship(back_populates="entries")

    assets: Mapped[list["Asset"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )
    items: Mapped[list["Item"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan", order_by="Item.order"
    )

    @property
    def asset_keys(self) -> list[str]:
        """Read-only list of this entry's asset object keys."""
        return [a.object_key for a in self.assets]


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("catalog_entries.id"))
    object_key: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(128))

    entry: Mapped[CatalogEntry] = relationship(back_populates="assets")


class ItemKind(str, enum.Enum):
    """The kind of a first-class entry item (AC50)."""

    text = "text"
    image = "image"
    video = "video"


class Item(Base):
    """A first-class piece of an entry's content (AC50): one text block or one media file, which an
    agent pulls onto the studio canvas as real source data."""

    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("catalog_entries.id"), index=True)
    kind: Mapped[ItemKind] = mapped_column(Enum(ItemKind))
    order: Mapped[int] = mapped_column(default=0)
    title: Mapped[str] = mapped_column(String(300), default="")
    # text items
    text: Mapped[str] = mapped_column(Text, default="")
    # media items (image/video)
    object_key: Mapped[str] = mapped_column(String(512), default="")
    content_type: Mapped[str] = mapped_column(String(128), default="")
    alt: Mapped[str] = mapped_column(String(500), default="")

    entry: Mapped[CatalogEntry] = relationship(back_populates="items")


class UserAssetSource(str, enum.Enum):
    """Origin of a user-storage asset (AC51): user upload, or AI-service generation."""

    local = "local"  # uploaded by the user
    agent = "agent"  # generated by an AI/LLM service


class UserAsset(Base):
    """A user's own asset in their personal storage (AC51) — an upload (``local``) or AI-generated
    (``agent``) image/text/video. Owner-scoped and stored under the owner's own storage prefix;
    usable in the studio alongside catalog items (the Local + Agent picker sections)."""

    __tablename__ = "user_assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    source: Mapped[UserAssetSource] = mapped_column(Enum(UserAssetSource), index=True)
    kind: Mapped[ItemKind] = mapped_column(Enum(ItemKind))  # image | text | video
    title: Mapped[str] = mapped_column(String(300), default="")
    text: Mapped[str] = mapped_column(Text, default="")  # text assets
    object_key: Mapped[str] = mapped_column(String(512), default="")  # media assets
    content_type: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now()
    )

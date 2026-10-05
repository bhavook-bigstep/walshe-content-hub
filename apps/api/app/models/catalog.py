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
    market_tags: Mapped[list[str]] = mapped_column(JSON, default=list)

    # Structured inventory (AC29) — explicit, typed data so AI agents can crawl it reliably.
    # `attributes` holds the per-type template fields ({field_key: value}); `highlights` are
    # structured selling points; `custom_sections` capture anything outside the template as
    # titled rich blocks ([{title, body}]).
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    highlights: Mapped[list[str]] = mapped_column(JSON, default=list)
    custom_sections: Mapped[list[dict]] = mapped_column(JSON, default=list)

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

"""Catalog entry + asset models (AC3/AC4/AC5/AC6).

Access scoping (``allowed_tenant_ids`` / ``allowed_agent_ids``) plus ``status`` and ``brand_safe``
are the data behind Contract 1 — enforced in one place by ``app.services.visibility``.
"""
from __future__ import annotations

import enum

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
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
    draft = "draft"
    approved = "approved"


class CatalogEntry(Base):
    __tablename__ = "catalog_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[CatalogType] = mapped_column(Enum(CatalogType))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    destination: Mapped[str] = mapped_column(String(200), index=True)
    market_tags: Mapped[list[str]] = mapped_column(JSON, default=list)

    status: Mapped[EntryStatus] = mapped_column(Enum(EntryStatus), default=EntryStatus.draft)
    brand_safe: Mapped[bool] = mapped_column(Boolean, default=False)
    # Empty lists == open to all approved+brand-safe viewers; non-empty == restricted scope.
    allowed_tenant_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    allowed_agent_ids: Mapped[list[int]] = mapped_column(JSON, default=list)

    provider_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    assets: Mapped[list["Asset"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("catalog_entries.id"))
    object_key: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(128))

    entry: Mapped[CatalogEntry] = relationship(back_populates="assets")

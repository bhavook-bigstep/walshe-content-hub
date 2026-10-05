"""User + tenant models and the Role enum (AC1/AC2)."""

from __future__ import annotations

import enum

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Role(str, enum.Enum):
    super_admin = "super_admin"
    content_provider = "content_provider"
    tourism_agent = "tourism_agent"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    # Organization profile (AC27): shown on the provider org page.
    blurb: Mapped[str | None] = mapped_column(String(600), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    markets: Mapped[list[str]] = mapped_column(JSON, default=list)  # e.g. ["Ireland", "Australia"]
    verified: Mapped[bool] = mapped_column(Boolean, default=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[Role] = mapped_column(Enum(Role))
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    # Content Providers start unapproved; a Super Admin approves them (AC2).
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    # Profile (AC27) — the user's "character" in the workspace.
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(600), nullable=True)
    avatar_color: Mapped[str] = mapped_column(String(9), default="#005653")
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)  # e.g. {"reduced_motion": false}

    tenant: Mapped[Tenant | None] = relationship()

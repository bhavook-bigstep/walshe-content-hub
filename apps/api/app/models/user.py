"""User + tenant models and the Role enum (AC1/AC2)."""
from __future__ import annotations

import enum

from sqlalchemy import Boolean, Enum, ForeignKey, String
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


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[Role] = mapped_column(Enum(Role))
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    # Content Providers start unapproved; a Super Admin approves them (AC2).
    approved: Mapped[bool] = mapped_column(Boolean, default=False)

    tenant: Mapped[Tenant | None] = relationship()

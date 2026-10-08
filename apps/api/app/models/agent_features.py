"""Agent workspace models (AC28): collections of catalog items + a reusable brand kit."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    item_ids: Mapped[list[int]] = mapped_column(JSON, default=list)


class UserSprite(Base):
    """An imported sprite animation: a sprite sheet sliced into ordered frame images, stored
    under the owner's ``users/<id>/sprites/<sprite id>/`` prefix. Owner-scoped."""

    __tablename__ = "user_sprites"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    # Ordered storage object keys of the frame PNGs (resolved to served URLs by the studio).
    frame_keys: Mapped[list[str]] = mapped_column(JSON, default=list)
    fps: Mapped[int] = mapped_column(Integer, default=10)
    frame_width: Mapped[int] = mapped_column(Integer, default=0)
    frame_height: Mapped[int] = mapped_column(Integer, default=0)


class BrandKit(Base):
    __tablename__ = "brand_kits"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(9), default="#005653")
    accent_color: Mapped[str] = mapped_column(String(9), default="#E5F6DF")
    # Brand typography: a font KEY (sans/serif/display/rounded/mono) the studio maps to a stack.
    heading_font: Mapped[str] = mapped_column(
        String(32), default="display", server_default="display"
    )
    body_font: Mapped[str] = mapped_column(String(32), default="sans", server_default="sans")
    contact_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)

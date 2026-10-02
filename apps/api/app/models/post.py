"""Social post model (AC14) — a composition scheduled/published to a simulated channel."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PostStatus(str, enum.Enum):
    scheduled = "scheduled"
    published = "published"


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    composition_id: Mapped[int] = mapped_column(ForeignKey("compositions.id"))
    channel: Mapped[str] = mapped_column(String(50))
    status: Mapped[PostStatus] = mapped_column(
        Enum(PostStatus, native_enum=False), default=PostStatus.scheduled
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

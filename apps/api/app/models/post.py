"""Social post model (AC14) — a composition scheduled/published to a simulated channel."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PostStatus(str, enum.Enum):
    scheduled = "scheduled"
    published = "published"
    failed = "failed"
    # Campaign lifecycle (design §3). Inc 1 uses draft/pending_approval; the rest are declared now
    # (the frozen state machine's vocabulary) and exercised in Inc 2.
    draft = "draft"
    pending_approval = "pending_approval"
    approved = "approved"
    publishing = "publishing"
    rejected = "rejected"
    cancelled = "cancelled"


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    composition_id: Mapped[int] = mapped_column(ForeignKey("compositions.id"))
    # Campaign link (Inc 1). Null = standalone/legacy post (manual /social + /social/instagram).
    campaign_id: Mapped[int | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(50))
    status: Mapped[PostStatus] = mapped_column(
        Enum(PostStatus, native_enum=False), default=PostStatus.scheduled
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Per-platform post content + publish receipt (Instagram increment 1).
    platform: Mapped[str] = mapped_column(String(20), default="instagram")
    caption: Mapped[str] = mapped_column(Text, default="")
    media_object_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    permalink: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error: Mapped[str] = mapped_column(Text, default="")

    # Approval gate (AC78). self-approval in the PoC: the owning agent is also the reviewer.
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str] = mapped_column(Text, default="")

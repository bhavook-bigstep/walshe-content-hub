"""Per-post engagement snapshot (AC15 dashboard) — platform-tagged, registry-shaped metrics.

A snapshot per sync: `metrics` holds `{metric_key: int}` as defined by the post's platform registry
(`app.social.metrics`), `fetched_at` stamps the pull so the dashboard can plot growth over time.
Importing this module registers the table on `Base.metadata`.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base


class Engagement(Base):
    __tablename__ = "engagement"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(Integer, index=True)
    platform: Mapped[str] = mapped_column(String(20), default="instagram")
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

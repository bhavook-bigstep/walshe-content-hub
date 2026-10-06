"""Per-post insights-sync state — so a failed refresh is visible, not mistaken for stale data.

One row per post, upserted on every sync attempt (success or failure). Kept separate from the
`Engagement` metric snapshots: a failed pull records the error here while the last-good snapshot
stays intact. Importing this module registers the table on `Base.metadata`.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PostInsightsSync(Base):
    __tablename__ = "post_insights_sync"

    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), primary_key=True)
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # sync_status: ok | error | never_synced
    sync_status: Mapped[str] = mapped_column(String(20), default="never_synced")
    last_error: Mapped[str] = mapped_column(Text, default="")

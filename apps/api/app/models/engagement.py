"""Per-post engagement metrics (AC15 dashboard).

Registration in ``app.models`` and demo seeding are intentionally deferred (t6); importing this
module is what registers the table on ``Base.metadata``.
"""

from __future__ import annotations

from sqlalchemy import Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Engagement(Base):
    __tablename__ = "engagement"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(Integer, index=True)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    engagement: Mapped[int] = mapped_column(Integer, default=0)

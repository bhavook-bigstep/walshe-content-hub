"""Off-limits blocklist (AC36 / FR-08).

A board flags a subject or place off-limits once; any catalog entry matching a term then never
appears to agents — enforced in the single visibility choke-point (``app.services.visibility``),
never scattered. Terms are stored lower-cased for case-insensitive substring matching.

PoC scope: the blocklist is platform-wide (one destination in the PoC == the one board's list).
Per-tenant scoping is a documented backlog item.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class BlocklistTerm(Base):
    __tablename__ = "blocklist_terms"

    id: Mapped[int] = mapped_column(primary_key=True)
    term: Mapped[str] = mapped_column(String(200), unique=True)  # stored lower-cased
    created_by: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

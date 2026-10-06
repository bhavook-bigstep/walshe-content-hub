"""Async import Job (AC71).

One owner-scoped row per Auto-Catalog import. The ``POST /me/auto-catalog/import`` handler inserts a
``Job(status=queued)`` and returns immediately (202); an in-process background task flips it
``running → done | failed`` and records how many drafts it created (and their ids, so the UI can
link to them). Content-free: this table never stores document text, keys or raw PII — ``error``
carries a short, safe message only (Contracts 2 & 5).
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(str, enum.Enum):
    """The import job lifecycle (AC71)."""

    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Owner scope: a provider only ever sees their own jobs (AC71).
    provider_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(48), default="auto_catalog_import")
    # The original filename, kept only as a human label for the bell list (never the file bytes).
    filename: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus), default=JobStatus.queued, index=True
    )
    drafts_created: Mapped[int] = mapped_column(Integer, default=0)
    # Ids of the draft entries this job produced, so the UI can deep-link to them (AC74).
    entry_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    # A short, safe failure message (no secret/PII) — empty unless the job failed.
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

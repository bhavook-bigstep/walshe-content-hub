"""Agent-run trace (AC45 observability).

One content-free row per agentic run (assistant / creative plan / knowledge): who ran it, what kind,
the derived intent, which tools were used, the provider, latency and outcome. No prompts, replies,
secrets or PII are stored — those go to LangSmith only when an operator opts in (see
``app.observability``). This is the always-on, in-app, demo-safe trace.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(32))  # assistant | plan | knowledge
    intent: Mapped[str] = mapped_column(String(32), default="")
    tools: Mapped[list[str]] = mapped_column(JSON, default=list)
    provider: Mapped[str] = mapped_column(String(32), default="")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    outcome: Mapped[str] = mapped_column(String(16), default="ok")  # ok | error
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

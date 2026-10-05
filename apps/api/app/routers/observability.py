"""Agent-run trace read (AC45) — super-admin only. Rows are content-free (see app.observability)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.agent_run import AgentRun
from app.models.user import Role, User

router = APIRouter(prefix="/traces", tags=["observability"])

_admin_only = require_role(Role.super_admin)


class AgentRunOut(BaseModel):
    id: int
    actor_id: int
    kind: str
    intent: str
    tools: list[str]
    provider: str
    latency_ms: int
    outcome: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[AgentRunOut])
def list_traces(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(_admin_only),
) -> list[AgentRun]:
    """The most recent agent runs across the hub, newest first."""
    stmt = select(AgentRun).order_by(AgentRun.id.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())

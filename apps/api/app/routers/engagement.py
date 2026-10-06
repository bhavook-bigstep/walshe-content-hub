"""Engagement dashboard (AC15): per-post metric rows, tourism agents only."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.engagement import Engagement
from app.models.user import Role, User

router = APIRouter(prefix="/engagement", tags=["engagement"])

_agent_only = require_role(Role.tourism_agent)


class EngagementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    post_id: int
    platform: str
    metrics: dict[str, int]
    fetched_at: datetime


@router.get("", response_model=list[EngagementOut])
def list_engagement(
    db: Session = Depends(get_db),
    _: User = Depends(_agent_only),
) -> list[Engagement]:
    return list(
        db.execute(select(Engagement).order_by(Engagement.post_id, Engagement.id)).scalars().all()
    )

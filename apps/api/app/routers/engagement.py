"""Engagement dashboard (AC15): per-post metric rows, tourism agents only."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import clock
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.composition import Composition
from app.models.engagement import Engagement
from app.models.post import Post
from app.models.user import Role, User
from app.services.insights_sync import sync_insights
from app.social.factory import get_insights_connector

router = APIRouter(prefix="/engagement", tags=["engagement"])

_agent_only = require_role(Role.tourism_agent)


class EngagementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    post_id: int
    platform: str
    metrics: dict[str, int]
    fetched_at: datetime


class RefreshOut(BaseModel):
    synced: int


@router.get("", response_model=list[EngagementOut])
def list_engagement(
    db: Session = Depends(get_db),
    _: User = Depends(_agent_only),
) -> list[Engagement]:
    return list(
        db.execute(select(Engagement).order_by(Engagement.post_id, Engagement.id)).scalars().all()
    )


@router.post("/refresh", response_model=RefreshOut)
def refresh_engagement(
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    now=Depends(clock.now),
) -> RefreshOut:
    """On-demand pull: sync insights for this agent's own published posts right now."""
    post_ids = [
        pid
        for (pid,) in db.execute(
            select(Post.id)
            .join(Composition, Composition.id == Post.composition_id)
            .where(Composition.agent_id == user.id, Post.external_id.is_not(None))
        ).all()
    ]
    synced = (
        sync_insights(db, get_insights_connector(settings), now, post_ids=post_ids)
        if post_ids
        else 0
    )
    return RefreshOut(synced=synced)

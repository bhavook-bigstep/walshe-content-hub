"""Campaign routes (design §7) — agent-owned; scheduling captures the creative at schedule time."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, clock
from app.deps import get_db, require_role
from app.models.campaign import Campaign, CampaignStatus
from app.models.composition import Composition
from app.models.post import Post, PostStatus
from app.models.user import Role, User
from app.schemas.campaign import (
    CampaignCreate,
    CampaignDetailOut,
    CampaignOut,
    CampaignPostOut,
)
from app.services.campaign_schedule import within_campaign_window
from app.storage.minio_client import Storage

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

_agent_only = require_role(Role.tourism_agent)
_MAX_BYTES = 8 * 1024 * 1024  # Instagram image limit (mirrors app/routers/instagram.py)
_MAX_CAPTION = 2200


def get_storage(request: Request) -> Storage:  # mirrors app/routers/assets.py:36-37
    return request.app.state.storage


def _owned_campaign(db: Session, campaign_id: int, user: User) -> Campaign:
    c = db.get(Campaign, campaign_id)
    if c is None or c.agent_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    return c


def _campaign_out(c: Campaign, post_count: int) -> CampaignOut:
    return CampaignOut(
        id=c.id, name=c.name, destination=c.destination, starts_on=c.starts_on,
        ends_on=c.ends_on, status=c.status.value, created_at=c.created_at, post_count=post_count,
    )


# Shared validation helpers — POST and PATCH call the SAME ones so they can never diverge.
def _validate_caption(caption: str) -> None:
    if len(caption) > _MAX_CAPTION:
        raise HTTPException(422, f"Caption exceeds Instagram's {_MAX_CAPTION}-character limit")


def _parse_scheduled_at(raw: str) -> datetime:
    """Parse an ISO-8601 datetime and REQUIRE an explicit timezone offset (design §4.1).

    A naive value is rejected (422), not silently assumed UTC. ``.date()`` on the result is the
    submitted offset's LOCAL date; ``.astimezone(timezone.utc)`` is what we store.
    """
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError as err:
        raise HTTPException(422, "scheduled_at must be an ISO-8601 datetime") from err
    if dt.tzinfo is None:
        raise HTTPException(422, "scheduled_at must include a timezone offset")
    return dt


def _read_jpeg(image: UploadFile) -> bytes:
    data = image.file.read()
    if data[:3] != b"\xff\xd8\xff":
        raise HTTPException(422, "Image must be a JPEG (Instagram does not accept PNG)")
    if len(data) > _MAX_BYTES:
        raise HTTPException(422, "Image exceeds Instagram's 8 MB limit")
    return data


@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
def create_campaign(
    body: CampaignCreate,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> CampaignOut:
    c = Campaign(
        agent_id=user.id, name=body.name, destination=body.destination,
        starts_on=body.starts_on, ends_on=body.ends_on,
        status=CampaignStatus.active, created_at=now,
    )
    db.add(c)
    db.flush()
    audit.record(db, actor_id=user.id, action="create", target_type="campaign", target_id=c.id)
    db.commit()
    db.refresh(c)
    return _campaign_out(c, 0)


@router.get("", response_model=list[CampaignOut])
def list_campaigns(
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
) -> list[CampaignOut]:
    campaigns = db.scalars(
        select(Campaign).where(Campaign.agent_id == user.id).order_by(Campaign.id.desc())
    ).all()
    if not campaigns:
        return []
    counts = dict(
        db.execute(
            select(Post.campaign_id, func.count())
            .where(Post.campaign_id.in_([c.id for c in campaigns]))
            .group_by(Post.campaign_id)
        ).all()
    )
    return [_campaign_out(c, counts.get(c.id, 0)) for c in campaigns]


@router.get("/{campaign_id}", response_model=CampaignDetailOut)
def get_campaign(
    campaign_id: int,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
) -> CampaignDetailOut:
    c = _owned_campaign(db, campaign_id, user)
    posts = db.scalars(
        select(Post).where(Post.campaign_id == c.id).order_by(Post.scheduled_at, Post.id)
    ).all()
    return CampaignDetailOut(
        **_campaign_out(c, len(posts)).model_dump(),
        posts=[CampaignPostOut.model_validate(p) for p in posts],
    )

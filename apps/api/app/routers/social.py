"""Social schedule/publish routes (AC14) — agent-only, simulated connector."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit, clock
from app.deps import get_db, require_role
from app.models.composition import Composition
from app.models.post import Post, PostStatus
from app.models.user import Role, User
from app.services import preflight, social_sim

router = APIRouter(prefix="/social", tags=["social"])

_agent_only = require_role(Role.tourism_agent)


class ScheduleRequest(BaseModel):
    composition_id: int
    channel: str
    scheduled_at: datetime | None = None


class PublishRequest(BaseModel):
    composition_id: int
    channel: str


class PostOut(BaseModel):
    id: int
    composition_id: int
    channel: str
    status: PostStatus
    scheduled_at: datetime | None
    published_at: datetime | None

    model_config = {"from_attributes": True}


class PreflightIssueOut(BaseModel):
    code: str
    message: str
    fix: str


class PreflightOut(BaseModel):
    ok: bool
    issues: list[PreflightIssueOut]


def _owned_composition(db: Session, composition_id: int, user: User) -> Composition:
    comp = db.get(Composition, composition_id)
    if comp is None or comp.agent_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Composition not found")
    return comp


def _preflight(db: Session, user: User, comp: Composition, channel: str, now: datetime) -> None:
    """Run the preflight check and block the send (422) with plain-word fixes if it fails (AC34)."""
    result = preflight.run_preflight(db, user, comp, channel, now=now)
    if not result.ok:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "preflight_failed",
                "issues": [asdict(i) for i in result.issues],
            },
        )


def _channel(channel: str) -> str:
    try:
        return social_sim.validate_channel(channel)
    except social_sim.UnsupportedChannel as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported channel") from err


def _find(db: Session, composition_id: int, channel: str) -> Post | None:
    return db.scalars(
        select(Post)
        .where(Post.composition_id == composition_id, Post.channel == channel)
        .order_by(Post.id.desc())
    ).first()


@router.post("/preflight", response_model=PreflightOut)
def preflight_check(
    body: PublishRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> PreflightOut:
    """Dry-run the pre-send check (AC34) so the agent sees issues before trying to send."""
    comp = _owned_composition(db, body.composition_id, user)
    result = preflight.run_preflight(db, user, comp, body.channel, now=now)
    return PreflightOut(
        ok=result.ok, issues=[PreflightIssueOut(**asdict(i)) for i in result.issues]
    )


@router.post("/schedule", response_model=PostOut, status_code=status.HTTP_201_CREATED)
def schedule(
    body: ScheduleRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> Post:
    comp = _owned_composition(db, body.composition_id, user)
    _preflight(db, user, comp, body.channel, now)  # AC34: blocked unless checks pass
    channel = _channel(body.channel)
    post = Post(
        composition_id=body.composition_id,
        channel=channel,
        status=PostStatus.scheduled,
        scheduled_at=body.scheduled_at or now,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@router.post("/publish", response_model=PostOut)
def publish(
    body: PublishRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> Post:
    comp = _owned_composition(db, body.composition_id, user)
    _preflight(db, user, comp, body.channel, now)  # AC34: blocked unless checks pass
    channel = _channel(body.channel)
    post = _find(db, body.composition_id, channel)
    if post is not None and post.status == PostStatus.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already published")
    receipt = social_sim.publish(channel=channel, composition_id=body.composition_id, now=now)
    if post is None:
        post = Post(composition_id=body.composition_id, channel=channel)
        db.add(post)
    post.status = PostStatus.published
    post.published_at = receipt.published_at
    db.flush()
    audit.record(db, actor_id=user.id, action="publish", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return post


@router.post("/unpublish", response_model=PostOut)
def unpublish(
    body: PublishRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
) -> Post:
    """Revert a published post to scheduled; traceable via audit (Contract 3)."""
    _owned_composition(db, body.composition_id, user)
    post = _find(db, body.composition_id, _channel(body.channel))
    if post is None or post.status != PostStatus.published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Published post not found")
    post.status = PostStatus.scheduled
    post.published_at = None
    audit.record(db, actor_id=user.id, action="unpublish", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return post

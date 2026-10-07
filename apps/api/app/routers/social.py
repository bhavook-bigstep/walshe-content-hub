"""Social schedule + approval routes (AC14 / AC80) — agent-only, simulated connector.

Scheduling a composition to a channel creates a post in ``pending_approval``; nothing is sent until
the owning agent approves it (PoC self-approval, mirroring the campaign flow). Approve publishes via
the deterministic simulated connector (Contract 2/4 — no OAuth, no egress); reject sends it back
with a reason. Posts are listed from the server (``GET /social/posts``) so they persist across
refreshes. There is no direct publish — nothing goes out without a review.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_serializer
from sqlalchemy import case, select
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


class PreflightRequest(BaseModel):
    composition_id: int
    channel: str


class RejectRequest(BaseModel):
    note: str = ""


class PostOut(BaseModel):
    id: int
    composition_id: int
    composition_name: str | None = None
    channel: str
    status: PostStatus
    scheduled_at: datetime | None
    published_at: datetime | None
    review_note: str = ""
    external_id: str | None = None

    @field_serializer("scheduled_at", "published_at")
    def _utc(self, value: datetime | None) -> str | None:
        # SQLite drops tzinfo; stamp UTC on output so the browser never reads stored-UTC as local.
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()


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


def _agent_post(db: Session, post_id: int, user: User) -> Post:
    post = db.get(Post, post_id)
    if post is not None:
        comp = db.get(Composition, post.composition_id)
        if comp is not None and comp.agent_id == user.id:
            return post
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")


def _preflight(db: Session, user: User, comp: Composition, channel: str, now: datetime) -> None:
    """Run the preflight check and block (422) with plain-word fixes if it fails (AC34)."""
    result = preflight.run_preflight(db, user, comp, channel, now=now)
    if not result.ok:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "preflight_failed", "issues": [asdict(i) for i in result.issues]},
        )


def _channel(channel: str) -> str:
    try:
        return social_sim.validate_channel(channel)
    except social_sim.UnsupportedChannel as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported channel") from err


def _due(scheduled_at: datetime | None, now: datetime) -> bool:
    """A post is due to post when it has no scheduled time or its scheduled time has arrived."""
    if scheduled_at is None:
        return True
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
    return scheduled_at <= now


def _publish_now(db: Session, post: Post, reviewer_id: int, now: datetime) -> None:
    """Publish a post via the simulated connector and record the receipt (no commit)."""
    receipt = social_sim.publish(channel=post.channel, composition_id=post.composition_id, now=now)
    post.status = PostStatus.published
    post.external_id = receipt.external_id
    post.published_at = receipt.published_at
    if post.approved_by is None:
        post.approved_by = reviewer_id
    if post.reviewed_at is None:
        post.reviewed_at = now
    audit.record(db, actor_id=reviewer_id, action="publish", target_type="post", target_id=post.id)


def _publish_due(db: Session, agent_id: int, now: datetime) -> None:
    """Publish every approved (greenlit) post whose scheduled time has arrived — the PoC's stand-in
    for a background scheduler (no worker; due posts post when the agent loads their list)."""
    approved = db.execute(
        select(Post)
        .join(Composition, Composition.id == Post.composition_id)
        .where(Composition.agent_id == agent_id, Post.status == PostStatus.approved)
    ).scalars().all()
    published = [p for p in approved if _due(p.scheduled_at, now)]
    for post in published:
        _publish_now(db, post, post.approved_by or agent_id, now)
    if published:
        db.commit()


def _out(db: Session, post: Post) -> PostOut:
    name = db.scalar(select(Composition.name).where(Composition.id == post.composition_id))
    return PostOut(
        id=post.id, composition_id=post.composition_id, composition_name=name,
        channel=post.channel, status=post.status, scheduled_at=post.scheduled_at,
        published_at=post.published_at, review_note=post.review_note or "",
        external_id=post.external_id,
    )


@router.get("/posts", response_model=list[PostOut])
def list_posts(
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> list[PostOut]:
    """The agent's own posts — social- AND campaign-scheduled (any post built from one of their
    compositions) — so the list survives a page refresh. Pending-approval posts (the ones needing
    action) sort first, then newest-first within each group. Approved posts whose scheduled time has
    arrived are published first (the PoC scheduler stand-in)."""
    _publish_due(db, user.id, now)
    pending_first = case((Post.status == PostStatus.pending_approval, 0), else_=1)
    rows = db.execute(
        select(Post, Composition.name)
        .join(Composition, Composition.id == Post.composition_id)
        .where(Composition.agent_id == user.id)
        .order_by(pending_first, Post.id.desc())
    ).all()
    return [
        PostOut(
            id=p.id, composition_id=p.composition_id, composition_name=name, channel=p.channel,
            status=p.status, scheduled_at=p.scheduled_at, published_at=p.published_at,
            review_note=p.review_note or "", external_id=p.external_id,
        )
        for p, name in rows
    ]


@router.post("/preflight", response_model=PreflightOut)
def preflight_check(
    body: PreflightRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> PreflightOut:
    """Dry-run the pre-send check (AC34) so the agent sees issues before scheduling."""
    comp = _owned_composition(db, body.composition_id, user)
    result = preflight.run_preflight(db, user, comp, body.channel, now=now)
    issues = [PreflightIssueOut(**asdict(i)) for i in result.issues]
    return PreflightOut(ok=result.ok, issues=issues)


@router.post("/schedule", response_model=PostOut, status_code=status.HTTP_201_CREATED)
def schedule(
    body: ScheduleRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> PostOut:
    """Schedule a composition to a channel. Preflight-gated; lands in pending_approval (AC80)."""
    comp = _owned_composition(db, body.composition_id, user)
    _preflight(db, user, comp, body.channel, now)
    channel = _channel(body.channel)
    post = Post(
        composition_id=body.composition_id, channel=channel, platform=channel,
        status=PostStatus.pending_approval, scheduled_at=body.scheduled_at or now,
    )
    db.add(post)
    db.flush()
    audit.record(db, actor_id=user.id, action="schedule", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return _out(db, post)


@router.post("/posts/{post_id}/approve", response_model=PostOut)
def approve(
    post_id: int,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> PostOut:
    """Approve a post (AC99). Approval greenlights it and records the reviewer; the post then posts
    **at its scheduled time** — if that time has already arrived (or there is none) it posts
    immediately via the simulated connector, otherwise it waits in `approved` until due."""
    post = _agent_post(db, post_id, user)
    if post.status != PostStatus.pending_approval:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Only a pending_approval post can be approved (is '{post.status.value}')",
        )
    post.approved_by = user.id
    post.reviewed_at = now
    post.review_note = ""
    audit.record(db, actor_id=user.id, action="approve", target_type="post", target_id=post.id)
    if _due(post.scheduled_at, now):
        _publish_now(db, post, user.id, now)  # scheduled time has passed → post now
    else:
        post.status = PostStatus.approved  # greenlit; posts when its scheduled time arrives
    db.commit()
    db.refresh(post)
    return _out(db, post)


@router.post("/posts/{post_id}/reject", response_model=PostOut)
def reject(
    post_id: int,
    body: RejectRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> PostOut:
    """Reject a pending post with a reason (AC80); it drops to rejected and is editable again."""
    post = _agent_post(db, post_id, user)
    if post.status != PostStatus.pending_approval:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Only a pending_approval post can be rejected (is '{post.status.value}')",
        )
    post.status = PostStatus.rejected
    post.approved_by = None
    post.reviewed_at = now
    post.review_note = body.note
    audit.record(db, actor_id=user.id, action="reject", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return _out(db, post)

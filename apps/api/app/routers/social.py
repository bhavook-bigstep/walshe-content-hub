"""Social schedule + approval routes (AC99) — agent-only, REAL Instagram publish.

Scheduling a composition to a channel captures its rendered JPEG now and creates a post in
``pending_approval``; nothing is sent until the owning agent approves it (PoC self-approval,
mirroring the campaign flow). Approve publishes the captured image through the SAME shared path as
Studio/campaigns (``app.social.publish.publish_post`` — preflight, duplicate guard, S3 hosting, the
env-selected connector) and posts immediately. Reject sends it back with a reason. Posts are listed
from the server (``GET /social/posts``) so they persist across refreshes. The scheduled time is a
planning label only — there is no background worker, so approval posts now (not at a future time).
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel, field_serializer
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app import audit, clock
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.composition import Composition
from app.models.post import Post, PostStatus
from app.models.user import Role, User
from app.services import preflight
from app.social import publish as publish_svc
from app.storage.minio_client import Storage

router = APIRouter(prefix="/social", tags=["social"])

_agent_only = require_role(Role.tourism_agent)
_MAX_BYTES = 8 * 1024 * 1024  # Instagram image limit (mirrors app/routers/instagram.py)
# Only Instagram is wired end-to-end (real publish path); it is the one connected platform in the
# PoC. The set is the seam other platforms slot into later without reshaping this route.
_SUPPORTED_CHANNELS = {"instagram"}


def get_storage(request: Request) -> Storage:  # mirrors app/routers/campaigns.py:39-40
    return request.app.state.storage


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


def _read_jpeg(image: UploadFile) -> bytes:
    data = image.file.read()
    if data[:3] != b"\xff\xd8\xff":
        raise HTTPException(422, "Image must be a JPEG (Instagram does not accept PNG)")
    if len(data) > _MAX_BYTES:
        raise HTTPException(422, "Image exceeds Instagram's 8 MB limit")
    return data


def _parse_scheduled_at(raw: str) -> datetime:
    """Parse an ISO-8601 datetime to UTC. A naive value is assumed UTC (the scheduled time is a
    display label only in the PoC, so we are lenient rather than rejecting it)."""
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError as err:
        raise HTTPException(422, "scheduled_at must be an ISO-8601 datetime") from err
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _captured_bytes(storage: Storage, post: Post) -> bytes | None:
    """Read the image captured at schedule time; a clean 409 (not a 500) if it is gone.

    The dev in-memory store is wiped on restart, so a post scheduled in a previous process has a
    media_object_key but no bytes. Set ASSET_DIR (filesystem) so captures survive restarts.
    """
    if not post.media_object_key:
        return None
    try:
        data, _ = storage.get_object(post.media_object_key)
        return data
    except (KeyError, FileNotFoundError) as err:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The captured image for this post is no longer available — reschedule it to re-capture "
            "it (set ASSET_DIR so captures persist across restarts).",
        ) from err


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
) -> list[PostOut]:
    """The agent's own posts — social- AND campaign-scheduled (any post built from one of their
    compositions) — so the list survives a page refresh. Pending-approval posts (the ones needing
    action) sort first, then newest-first within each group."""
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
    composition_id: int = Form(...),
    channel: str = Form("instagram"),
    scheduled_at: str | None = Form(None),
    image: UploadFile | None = File(None),
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    now: datetime = Depends(clock.now),
) -> PostOut:
    """Schedule a composition to Instagram, capturing its rendered JPEG now (so approve can publish
    it for real). Preflight-gated; lands in pending_approval (AC99)."""
    comp = _owned_composition(db, composition_id, user)
    if channel not in _SUPPORTED_CHANNELS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Only Instagram is connected")
    if image is None:
        raise HTTPException(422, "Provide the rendered image to post")
    data = _read_jpeg(image)  # validate before writing anything
    _preflight(db, user, comp, channel, now)
    sched_utc = _parse_scheduled_at(scheduled_at) if scheduled_at else now

    post = Post(
        composition_id=composition_id, channel=channel, platform=channel,
        status=PostStatus.pending_approval, scheduled_at=sched_utc,
    )
    db.add(post)
    db.flush()  # assign post.id for the storage key
    key = f"social-posts/{post.id}/{uuid4().hex}.jpg"  # uuid avoids a same-second replace clash
    storage.put_object(key, data, "image/jpeg")  # captured now; approve publishes from this
    post.media_object_key = key
    audit.record(db, actor_id=user.id, action="schedule", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return _out(db, post)


@router.post("/posts/{post_id}/approve", response_model=PostOut)
def approve(
    post_id: int,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
    now: datetime = Depends(clock.now),
) -> PostOut:
    """Approve AND publish a pending post in one action (AC99). PoC self-approval: the owning agent
    is also the reviewer. Approval records the reviewer and publishes the captured image immediately
    via the shared real path (preflight + duplicate guard + receipt); on a guard/publish failure
    nothing is approved and the reason is returned (422/409/503/502)."""
    post = _agent_post(db, post_id, user)
    if post.status != PostStatus.pending_approval:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Only a pending_approval post can be approved (is '{post.status.value}')",
        )
    comp = db.get(Composition, post.composition_id)
    if comp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Composition not found")

    media_bytes = _captured_bytes(storage, post)
    # Record the reviewer now; if a guard below rejects (422/409/503) the session rolls back and the
    # post stays pending_approval. On a connector failure the publish path commits it as `failed`.
    post.approved_by = user.id
    post.reviewed_at = now
    post.review_note = ""
    audit.record(db, actor_id=user.id, action="approve", target_type="post", target_id=post.id)
    publish_svc.publish_post(
        db, settings, now, user=user, post=post, composition=comp, media_bytes=media_bytes
    )
    return _out(db, post)


@router.post("/posts/{post_id}/reject", response_model=PostOut)
def reject(
    post_id: int,
    body: RejectRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> PostOut:
    """Reject a pending post with a reason (AC99); it drops to rejected and is editable again."""
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

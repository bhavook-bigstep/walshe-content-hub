"""Campaign routes (design §7) — agent-owned; scheduling captures the creative at schedule time."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import audit, clock
from app.config import Settings
from app.deps import get_db, get_settings, require_role
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
from app.social import publish as publish_svc
from app.storage.minio_client import Storage

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

_agent_only = require_role(Role.tourism_agent)
_MAX_BYTES = 8 * 1024 * 1024  # Instagram image limit (mirrors app/routers/instagram.py)
_MAX_CAPTION = 2200
# Platform lives at the post level (design §3). Instagram-only for the PoC; the set is the seam
# other platforms slot into later without reshaping the campaign.
_SUPPORTED_PLATFORMS = {"instagram"}


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


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    campaign_id: int,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
) -> None:
    """Delete a campaign and its posts (Contract 3: traceable)."""
    campaign = _owned_campaign(db, campaign_id, user)
    db.execute(delete(Post).where(Post.campaign_id == campaign.id))
    audit.record(db, actor_id=user.id, action="delete", target_type="campaign",
                 target_id=campaign.id)
    db.delete(campaign)
    db.commit()


@router.post("/{campaign_id}/posts", response_model=CampaignPostOut,
             status_code=status.HTTP_201_CREATED)
def create_campaign_post(
    campaign_id: int,
    composition_id: int = Form(...),
    caption: str = Form(""),
    platform: str = Form("instagram"),
    scheduled_at: str | None = Form(None),
    image: UploadFile = File(...),
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> CampaignPostOut:
    """Create a campaign post, optionally scheduled; captures the rendered JPEG now (design §4)."""
    campaign = _owned_campaign(db, campaign_id, user)
    comp = db.get(Composition, composition_id)
    if comp is None or comp.agent_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Composition not found")
    if platform not in _SUPPORTED_PLATFORMS:
        raise HTTPException(422, f"Unsupported platform '{platform}'")
    _validate_caption(caption)
    data = _read_jpeg(image)  # validate before writing anything

    sched_utc: datetime | None = None
    post_status = PostStatus.draft
    if scheduled_at:
        dt = _parse_scheduled_at(scheduled_at)
        if not within_campaign_window(dt, campaign.starts_on, campaign.ends_on):
            raise HTTPException(422, "scheduled_at is outside the campaign window")
        sched_utc = dt.astimezone(timezone.utc)
        post_status = PostStatus.pending_approval

    post = Post(
        campaign_id=campaign.id, composition_id=comp.id, channel=platform,
        platform=platform, caption=caption, status=post_status, scheduled_at=sched_utc,
    )
    db.add(post)
    db.flush()  # assign post.id for the storage key
    key = f"campaign-posts/{post.id}/{uuid4().hex}.jpg"  # uuid avoids a same-second replace clash
    storage.put_object(key, data, "image/jpeg")  # captured now; Inc 2 publishes from this
    post.media_object_key = key
    audit.record(db, actor_id=user.id, action="schedule", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return CampaignPostOut.model_validate(post)


# A failed publish is editable too, so the agent can fix + reschedule it (→ pending) and retry.
_EDITABLE = {PostStatus.draft, PostStatus.pending_approval, PostStatus.rejected, PostStatus.failed}


@router.patch("/{campaign_id}/posts/{post_id}", response_model=CampaignPostOut)
def edit_post(
    campaign_id: int,
    post_id: int,
    caption: str | None = Form(None),
    clear_caption: bool = Form(False),
    scheduled_at: str | None = Form(None),
    unschedule: bool = Form(False),
    image: UploadFile | None = File(None),
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> CampaignPostOut:
    campaign = _owned_campaign(db, campaign_id, user)
    post = db.get(Post, post_id)
    if post is None or post.campaign_id != campaign.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    if post.status not in _EDITABLE:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Cannot edit a post in '{post.status.value}'")
    if (caption is None and not clear_caption and scheduled_at is None
            and not unschedule and image is None):
        raise HTTPException(422, "At least one change is required")

    # ---- 1. Validate EVERYTHING before writing a byte or mutating the row ----
    # (otherwise an invalid schedule after an image upload leaves an orphaned object).
    # An empty multipart form value is indistinguishable from an absent one in FastAPI's `Form`,
    # so clearing a caption to "" uses the explicit `clear_caption` flag (like `unschedule`).
    if unschedule and scheduled_at is not None:
        raise HTTPException(422, "Pass either scheduled_at or unschedule, not both")
    if caption is not None and clear_caption:
        raise HTTPException(422, "Pass either caption or clear_caption, not both")
    if caption is not None:
        _validate_caption(caption)
    data = _read_jpeg(image) if image is not None else None
    new_sched_utc: datetime | None = None
    if scheduled_at is not None:
        dt = _parse_scheduled_at(scheduled_at)
        if not within_campaign_window(dt, campaign.starts_on, campaign.ends_on):
            raise HTTPException(422, "scheduled_at is outside the campaign window")
        new_sched_utc = dt.astimezone(timezone.utc)

    # ---- 2. All checks passed — now write (object first, then the row) ----
    if clear_caption:
        post.caption = ""
    elif caption is not None:
        post.caption = caption
    if data is not None:
        key = f"campaign-posts/{post.id}/{uuid4().hex}.jpg"
        storage.put_object(key, data, "image/jpeg")
        post.media_object_key = key  # old object left in storage (orphan cleanup out of PoC scope)
    if unschedule:
        post.scheduled_at = None
        post.status = PostStatus.draft
    elif scheduled_at is not None:
        post.scheduled_at = new_sched_utc
        post.status = PostStatus.pending_approval
    # Inc 2 also clears approval fields here (approved_by/reviewed_at/review_note) once added.

    audit.record(db, actor_id=user.id, action="edit", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return CampaignPostOut.model_validate(post)


# ── Approval gate + publish (AC78/AC79) ──────────────────────────────────────────────────────────
#
# Approve IS the publish decision (one action): approving a pending post records the approver and
# publishes it immediately through the shared path. There is no separate "publish" step — the PoC
# has no background worker, so there is nothing to defer a future-scheduled post TO; the scheduled
# time is a planning slot on the calendar, and approval posts now. Deferred publish-at-time is a
# scheduler-worker follow-up.


def _campaign_post(db: Session, campaign: Campaign, post_id: int) -> Post:
    post = db.get(Post, post_id)
    if post is None or post.campaign_id != campaign.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return post


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
            "The captured image for this post is no longer available — edit the post to re-capture "
            "it (set ASSET_DIR so captures persist across restarts).",
        ) from err


@router.post("/{campaign_id}/posts/{post_id}/approve", response_model=CampaignPostOut)
def approve_post(
    campaign_id: int,
    post_id: int,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
    now: datetime = Depends(clock.now),
) -> CampaignPostOut:
    """Approve AND publish a pending post in one action (AC78/AC79). PoC self-approval: the owning
    agent is also the reviewer (a separate reviewer person/role is a backlog item). Approval records
    the reviewer and publishes immediately via the shared path (preflight + dedup + receipt); on a
    guard/publish failure nothing is approved and the reason is returned (422/409/503/502)."""
    campaign = _owned_campaign(db, campaign_id, user)
    post = _campaign_post(db, campaign, post_id)
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
    return CampaignPostOut.model_validate(post)


@router.post("/{campaign_id}/posts/{post_id}/reject", response_model=CampaignPostOut)
def reject_post(
    campaign_id: int,
    post_id: int,
    note: str = Form(""),
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> CampaignPostOut:
    """Reject a pending post with a reason (AC78); it drops to rejected and is editable again."""
    campaign = _owned_campaign(db, campaign_id, user)
    post = _campaign_post(db, campaign, post_id)
    if post.status != PostStatus.pending_approval:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Only a pending_approval post can be rejected (is '{post.status.value}')",
        )
    post.status = PostStatus.rejected
    post.approved_by = None
    post.reviewed_at = now
    post.review_note = note
    audit.record(db, actor_id=user.id, action="reject", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return CampaignPostOut.model_validate(post)

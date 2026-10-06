"""Instagram publish route (increment 1): one image + caption from an owned composition.

Agent-only. Validates the image is a JPEG within Instagram's size/caption limits, uploads it to S3
for a public URL (real connector only), publishes via the env-selected connector (real or stub),
persists the ``Post`` with the receipt, and audits the action (Contract 3). Publish-now only — the
review gate and scheduler are later increments.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit, clock
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.composition import Composition
from app.models.post import Post, PostStatus
from app.models.user import Role, User
from app.schemas.instagram import InstagramPublishOut
from app.services import preflight
from app.social.base import PublishError
from app.social.factory import get_connector
from app.storage import s3_media

router = APIRouter(prefix="/social/instagram", tags=["instagram"])

_agent_only = require_role(Role.tourism_agent)
_MAX_BYTES = 8 * 1024 * 1024  # Instagram image limit
_MAX_CAPTION = 2200


def _owned_composition(db: Session, composition_id: int, user: User) -> Composition:
    comp = db.get(Composition, composition_id)
    if comp is None or comp.agent_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Composition not found")
    return comp


@router.post("/publish", response_model=InstagramPublishOut)
def publish(
    composition_id: int = Form(...),
    caption: str = Form(""),
    image: UploadFile | None = File(None),
    image_url: str | None = Form(None),
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> InstagramPublishOut:
    """Publish from an uploaded JPEG (hosted on S3 for the real connector) OR a pre-hosted
    ``image_url`` (no upload/S3 — used to verify the flow end-to-end before S3 exists)."""
    comp = _owned_composition(db, composition_id, user)
    if len(caption) > _MAX_CAPTION:
        raise HTTPException(422, f"Caption exceeds Instagram's {_MAX_CAPTION}-character limit")

    # Contract 1 / AC6 / AC34: only approved, brand-safe, in-scope content may reach the live
    # account. The simulated /social path already gates on this; the live path must too, or the
    # product's one promise — verified content — is bypassed exactly where it matters most.
    pf = preflight.run_preflight(db, user, comp, "instagram", now=now)
    if not pf.ok:
        raise HTTPException(
            422, {"error": "preflight_failed", "issues": [asdict(i) for i in pf.issues]}
        )

    # A pre-hosted image_url skips the render + upload pipeline; in live mode it's a verification
    # affordance only, off unless explicitly enabled (otherwise any URL could be posted).
    if image_url and settings.instagram_configured() and not settings.instagram_allow_prehosted_url:
        raise HTTPException(
            422, "A pre-hosted image_url is not allowed in live mode; upload an image"
        )

    # Validate the uploaded file (if any) before creating the post row.
    data: bytes | None = None
    if not image_url and image is not None:
        data = image.file.read()
        if data[:3] != b"\xff\xd8\xff":
            raise HTTPException(422, "Image must be a JPEG (Instagram does not accept PNG)")
        if len(data) > _MAX_BYTES:
            raise HTTPException(422, "Image exceeds Instagram's 8 MB limit")
    elif not image_url and image is None:
        raise HTTPException(422, "Provide an image file or an image_url")

    # The live connector fetches the image server-side, so an uploaded file needs a public URL via
    # S3. Fail fast with a clear message rather than a 500 from the storage layer.
    needs_s3 = data is not None and not image_url and settings.instagram_configured()
    if needs_s3 and not settings.s3_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Image hosting (S3) is not configured — set S3_BUCKET/S3_REGION + AWS keys.",
        )

    # Idempotency: a composition already live on Instagram is a 409, not a second (unrecoverable)
    # post. This guards double-clicks and request replays — the real honouring of the per-post key.
    already = db.scalars(
        select(Post).where(
            Post.composition_id == comp.id,
            Post.channel == "instagram",
            Post.status == PostStatus.published,
        )
    ).first()
    if already is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This composition is already published to Instagram"
        )

    connector = get_connector(settings)
    post = Post(
        composition_id=comp.id,
        channel="instagram",
        platform="instagram",
        caption=caption,
        status=PostStatus.scheduled,
    )
    db.add(post)
    db.flush()  # assign post.id for the S3 key

    resolved_url: str | None = None
    if image_url:
        resolved_url = image_url  # pre-hosted public URL; no upload needed
    elif data is not None and settings.instagram_configured():
        # real connector needs a public URL; the stub does not
        key = f"posts/{post.id}/{int(now.timestamp())}.jpg"
        resolved_url = s3_media.upload_jpeg(settings, key, data)
        post.media_object_key = key

    try:
        result = connector.publish(
            image_url=resolved_url, caption=caption, idempotency_key=f"post-{post.id}"
        )
    except PublishError as err:
        post.status = PostStatus.failed
        post.error = f"{err.code}: {err}"
        db.commit()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            {"error": "publish_failed", "code": err.code, "retryable": err.retryable},
        ) from err

    post.status = PostStatus.published
    post.external_id = result.external_id
    post.permalink = result.permalink
    post.published_at = now
    audit.record(db, actor_id=user.id, action="publish", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return InstagramPublishOut(
        post_id=post.id,
        external_id=post.external_id,
        permalink=post.permalink,
        status=post.status.value,
    )

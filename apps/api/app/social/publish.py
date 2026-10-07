"""Shared publish orchestration for one image post to Instagram (AC34 / AC98).

Both the Studio publish-now route and the campaign approve->publish route go through here, so the
guards can never diverge: preflight (Contract 1 / AC6 / AC34), a duplicate-publish block, the
S3-hosting requirement in live mode, then the env-selected connector (real or deterministic stub),
recording the receipt on the post. The access token lives in Settings and is never logged.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.config import Settings
from app.models.composition import Composition
from app.models.post import Post, PostStatus
from app.models.user import User
from app.services import preflight
from app.social.base import PublishError
from app.social.factory import get_connector
from app.storage import s3_media


def publish_post(
    db: Session,
    settings: Settings,
    now: datetime,
    *,
    user: User,
    post: Post,
    composition: Composition,
    media_bytes: bytes | None = None,
    image_url: str | None = None,
) -> None:
    """Preflight + dedup + host + publish ``post`` to Instagram, recording the receipt.

    Mutates ``post`` (status + receipt, or ``failed`` + ``error``), writes an audit row and commits.
    Raises ``HTTPException`` for a guard failure (422 preflight / 422 bad image_url / 503 no S3 /
    409 duplicate) or a publish failure (502). ``post`` must already be flushed (``post.id`` set).
    """
    # Contract 1 / AC6 / AC34: only approved, brand-safe, in-scope content reaches the live account.
    pf = preflight.run_preflight(db, user, composition, "instagram", now=now)
    if not pf.ok:
        raise HTTPException(
            422, {"error": "preflight_failed", "issues": [asdict(i) for i in pf.issues]}
        )

    # A pre-hosted image_url skips render+upload; in live mode it's a verification affordance only.
    if image_url and settings.instagram_configured() and not settings.instagram_allow_prehosted_url:
        raise HTTPException(
            422, "A pre-hosted image_url is not allowed in live mode; upload an image"
        )

    # The live connector fetches the image server-side, so an uploaded file needs a public URL.
    needs_s3 = media_bytes is not None and not image_url and settings.instagram_configured()
    if needs_s3 and not settings.s3_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Image hosting (S3) is not configured — set S3_BUCKET/S3_REGION + AWS keys.",
        )

    # Idempotency: a different post for this composition already live on Instagram is a 409, not a
    # second (unrecoverable) post. Excludes this post so a retry of the same row is not blocked.
    already = db.scalars(
        select(Post).where(
            Post.composition_id == composition.id,
            Post.channel == "instagram",
            Post.status == PostStatus.published,
            Post.id != post.id,
        )
    ).first()
    if already is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This composition is already published to Instagram"
        )

    resolved_url: str | None = None
    if image_url:
        resolved_url = image_url
    elif media_bytes is not None and settings.instagram_configured():
        key = f"posts/{post.id}/{int(now.timestamp())}.jpg"
        resolved_url = s3_media.upload_jpeg(settings, key, media_bytes)
        if not post.media_object_key:
            post.media_object_key = key

    connector = get_connector(settings)
    try:
        result = connector.publish(
            image_url=resolved_url, caption=post.caption, idempotency_key=f"post-{post.id}"
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

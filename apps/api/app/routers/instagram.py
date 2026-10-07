"""Instagram publish route (increment 1): one image + caption from an owned composition.

Agent-only. Validates the image is a JPEG within Instagram's size/caption limits, uploads it to S3
for a public URL (real connector only), publishes via the env-selected connector (real or stub),
persists the ``Post`` with the receipt, and audits the action (Contract 3). Publish-now only — the
review gate and scheduler are later increments.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import clock
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.composition import Composition
from app.models.post import Post, PostStatus
from app.models.user import Role, User
from app.schemas.instagram import InstagramPublishOut
from app.social import publish as publish_svc

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

    post = Post(
        composition_id=comp.id,
        channel="instagram",
        platform="instagram",
        caption=caption,
        status=PostStatus.scheduled,
    )
    db.add(post)
    db.flush()  # assign post.id before the shared publish path hosts + publishes

    # One shared path (preflight, dedup, S3 hosting, connector, receipt) for Studio + campaigns.
    publish_svc.publish_post(
        db, settings, now, user=user, post=post, composition=comp,
        media_bytes=data, image_url=image_url,
    )
    return InstagramPublishOut(
        post_id=post.id,
        external_id=post.external_id,
        permalink=post.permalink,
        status=post.status.value,
    )

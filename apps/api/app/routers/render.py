"""Render routes (AC12/AC13): design -> PDF / email HTML / video MP4."""

from __future__ import annotations

import os
import tempfile
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.deps import get_db, require_role
from app.media.html_export import design_to_email_html
from app.media.pdf import design_to_pdf
from app.media.video import build_scene_script
from app.media.video import render_video as encode_video
from app.models.user import Role, User
from app.routers.assets import get_storage
from app.services.visibility import agent_visible_entries_by_ids
from app.storage.minio_client import Storage

router = APIRouter(prefix="/render", tags=["render"])

_agent_only = require_role(Role.tourism_agent)


class RenderRequest(BaseModel):
    design: dict[str, Any]


@router.post("/pdf")
def render_pdf(body: RenderRequest, _: User = Depends(_agent_only)) -> Response:
    return Response(content=design_to_pdf(body.design), media_type="application/pdf")


@router.post("/email-html")
def render_email_html(body: RenderRequest, _: User = Depends(_agent_only)) -> dict[str, str]:
    return {"html": design_to_email_html(body.design)}


class VideoScene(BaseModel):
    item_id: int | None = None
    title: str = Field(max_length=200)
    caption: str = Field(default="", max_length=200)


class VideoRequest(BaseModel):
    scenes: list[VideoScene] = Field(min_length=1, max_length=20)
    narrate: bool = False


_IMAGE_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
}


def _scene_image_paths(
    db: Session, agent: User, storage: Storage, scenes: list[VideoScene], tmp: str, *, now: datetime
) -> list[str | None]:
    """Per-scene image path (by index); None for hidden/unknown/expired/image-less entries."""
    ids = [s.item_id for s in scenes if s.item_id is not None]
    visible = {e.id: e for e in agent_visible_entries_by_ids(db, agent, ids, now=now)}
    images: list[str | None] = []
    for i, scene in enumerate(scenes):
        entry = visible.get(scene.item_id) if scene.item_id is not None else None
        keys = entry.asset_keys if entry is not None else []
        path: str | None = None
        if keys:
            try:
                data, ctype = storage.get_object(keys[0])
            except KeyError:
                data, ctype = b"", ""
            if data:
                path = os.path.join(tmp, f"scene{i}{_IMAGE_EXT.get(ctype.lower(), '.jpg')}")
                with open(path, "wb") as fh:
                    fh.write(data)
        images.append(path)
    return images


@router.post("/video")
def render_video(
    body: VideoRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    now: datetime = Depends(clock.now),
) -> Response:
    """Render scenes to a rudimentary MP4. Images come only from visible catalog entries
    resolved server-side (no client-supplied file paths are ever used)."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            images = _scene_image_paths(db, agent, storage, body.scenes, tmp, now=now)
            scenes = build_scene_script(
                [{"title": s.title, "description": s.caption} for s in body.scenes]
            )
            path = encode_video(scenes, images, tts=body.narrate)
            with open(path, "rb") as fh:
                data = fh.read()
    except (RuntimeError, OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="video rendering unavailable") from exc
    except Exception as exc:  # e.g. ffmpeg CalledProcessError
        raise HTTPException(status_code=500, detail="video rendering failed") from exc
    return Response(content=data, media_type="video/mp4")

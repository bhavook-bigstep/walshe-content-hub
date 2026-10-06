"""Render routes (AC12/AC13): design -> PDF / email HTML / video MP4."""

from __future__ import annotations

import base64
import os
import tempfile
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.deps import get_db, require_role
from app.media.html_export import design_to_email_html
from app.media.pdf import design_to_pdf
from app.media.video import build_scene_script
from app.media.video import render_video as encode_video
from app.media.video import render_video_frames as encode_frames
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
    # AC47 storyboard: per-scene lifespan (ms, clamped server-side) + transition to the next scene.
    duration_ms: int | None = Field(default=None, ge=0, le=60000)
    transition: Literal["none", "fade", "slide-left", "zoom"] = "none"


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
                [
                    {
                        "title": s.title,
                        "description": s.caption,
                        "duration_ms": s.duration_ms,
                        "transition": s.transition,
                    }
                    for s in body.scenes
                ]
            )
            path = encode_video(scenes, images, tts=body.narrate)
            with open(path, "rb") as fh:
                data = fh.read()
    except (RuntimeError, OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="video rendering unavailable") from exc
    except Exception as exc:  # e.g. ffmpeg CalledProcessError
        raise HTTPException(status_code=500, detail="video rendering failed") from exc
    return Response(content=data, media_type="video/mp4")


# ── WYSIWYG frame-capture video (AC78): the client rasterises each animated scene frame-by-frame
# and posts the frames; the server just sequences + stitches them. Frames are inert image bytes
# (data: URLs) the agent composed from approved assets — never file paths, never a network fetch.
_MAX_TOTAL_FRAMES = 2400


def _decode_frame(data_url: str) -> bytes | None:
    if not data_url.startswith("data:"):
        return None
    header, _, payload = data_url.partition(",")
    if not payload or ";base64" not in header:
        return None
    try:
        return base64.b64decode(payload, validate=True)
    except Exception:
        return None


class FrameScene(BaseModel):
    title: str = Field(default="", max_length=200)
    caption: str = Field(default="", max_length=200)
    narration: str = Field(default="", max_length=600)
    duration_ms: int = Field(ge=0, le=60000)
    transition: Literal["none", "fade", "slide-left", "zoom"] = "none"
    frames: list[str] = Field(min_length=1, max_length=900)


class FramesVideoRequest(BaseModel):
    fps: int = Field(default=20, ge=1, le=30)
    scenes: list[FrameScene] = Field(min_length=1, max_length=20)
    narrate: bool = False


@router.post("/video-frames")
def render_video_frames(body: FramesVideoRequest, _: User = Depends(_agent_only)) -> Response:
    """Encode pre-rendered WYSIWYG animation frames into an MP4 (preview == export)."""
    total = sum(len(s.frames) for s in body.scenes)
    if total > _MAX_TOTAL_FRAMES:
        raise HTTPException(status_code=413, detail="too many frames")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            frame_dirs: list[str] = []
            for i, scene in enumerate(body.scenes):
                d = os.path.join(tmp, f"scene{i}")
                os.makedirs(d, exist_ok=True)
                for j, frame in enumerate(scene.frames):
                    raw = _decode_frame(frame)
                    if raw is None:
                        raise ValueError("invalid frame")
                    with open(os.path.join(d, f"frame{j:05d}.jpg"), "wb") as fh:
                        fh.write(raw)
                frame_dirs.append(d)
            scenes = build_scene_script(
                [
                    {
                        "title": s.title,
                        "description": s.caption,
                        "narration": s.narration,
                        "duration_ms": s.duration_ms,
                        "transition": s.transition,
                    }
                    for s in body.scenes
                ]
            )
            path = encode_frames(scenes, frame_dirs, fps=body.fps, tts=body.narrate)
            with open(path, "rb") as fh:
                data = fh.read()
    except (RuntimeError, OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="video rendering unavailable") from exc
    except Exception as exc:  # e.g. ffmpeg CalledProcessError
        raise HTTPException(status_code=500, detail="video rendering failed") from exc
    return Response(content=data, media_type="video/mp4")

"""Render routes (AC12/AC13): design -> PDF / email HTML / video MP4."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.deps import require_role
from app.media.html_export import design_to_email_html
from app.media.pdf import design_to_pdf
from app.media.video import build_scene_script
from app.media.video import render_video as encode_video
from app.models.user import Role, User

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


class VideoRequest(BaseModel):
    items: list[dict[str, Any]] = Field(min_length=1, max_length=20)
    narrate: bool = False


@router.post("/video")
def render_video(body: VideoRequest, _: User = Depends(_agent_only)) -> Response:
    """Render items to a rudimentary MP4 (no client-supplied file paths are ever used)."""
    try:
        path = encode_video(build_scene_script(body.items), None, tts=body.narrate)
        with open(path, "rb") as fh:
            data = fh.read()
    except (RuntimeError, OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="video rendering unavailable") from exc
    except Exception as exc:  # e.g. ffmpeg CalledProcessError
        raise HTTPException(status_code=500, detail="video rendering failed") from exc
    return Response(content=data, media_type="video/mp4")

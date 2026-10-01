"""Render routes (AC12): design -> PDF / email HTML."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from app.deps import require_role
from app.media.html_export import design_to_email_html
from app.media.pdf import design_to_pdf
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

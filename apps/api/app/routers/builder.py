"""Builder routes (AC10): prompt + selected items -> design (agent-only)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.ai.builder import BuilderItem, build_design
from app.ai.factory import get_provider
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.user import Role, User
from app.services.visibility import agent_visible_entries_by_ids

router = APIRouter(prefix="/builder", tags=["builder"])

_agent_only = require_role(Role.tourism_agent)


class DesignRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    item_ids: list[int] = Field(min_length=1, max_length=50)


@router.post("/design")
def design(
    body: DesignRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> dict[str, Any]:
    # Contract 1: never trust client content; resolve ids through the visibility choke-point.
    rows = agent_visible_entries_by_ids(db, agent, body.item_ids, now=now)
    if not rows:
        raise HTTPException(status_code=404, detail="No visible catalog items")
    items = [BuilderItem(r.id, r.title, r.destination or "", r.description or "") for r in rows]
    return build_design(body.prompt, items, get_provider(settings)).to_dict()

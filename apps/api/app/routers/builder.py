"""Builder routes (AC10): prompt + selected items -> design (agent-only)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.ai.builder import BuilderItem, build_design
from app.ai.factory import get_provider
from app.config import Settings
from app.deps import get_settings, require_role
from app.models.user import Role, User

router = APIRouter(prefix="/builder", tags=["builder"])

_agent_only = require_role(Role.tourism_agent)


class BuilderItemIn(BaseModel):
    id: int
    title: str = Field(min_length=1, max_length=300)
    destination: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=2000)


class DesignRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    items: list[BuilderItemIn] = Field(min_length=1, max_length=50)


@router.post("/design")
def design(
    body: DesignRequest,
    _: User = Depends(_agent_only),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    items = [BuilderItem(i.id, i.title, i.destination, i.description) for i in body.items]
    return build_design(body.prompt, items, get_provider(settings)).to_dict()

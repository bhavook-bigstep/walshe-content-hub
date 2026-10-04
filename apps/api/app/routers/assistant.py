"""Assistant + discovery routes (AC38–AC40) — agent-only, grounded in visible catalog content."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.agents import tools
from app.agents.assistant import run_assistant
from app.agents.tools import ItemCard
from app.ai.factory import get_provider
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.user import Role, User

router = APIRouter(tags=["assistant"])

_agent_only = require_role(Role.tourism_agent)


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ItemCardOut(BaseModel):
    id: int
    title: str
    type: str
    destination: str
    display_status: str
    reason: str = ""


class AssistantOut(BaseModel):
    reply: str
    intent: str
    items: list[ItemCardOut]
    suggestion: dict | None = None


class SuggestionsOut(BaseModel):
    items: list[ItemCardOut]


def _cards(items: list[ItemCard]) -> list[ItemCardOut]:
    return [ItemCardOut(**asdict(i)) for i in items]


@router.post("/assistant", response_model=AssistantOut)
def assistant(
    body: AssistantRequest,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> AssistantOut:
    """Ask the grounded Content Assistant (AC38/AC39). It only ever speaks about visible content."""
    result = run_assistant(db, agent, body.message, get_provider(settings), now=now)
    return AssistantOut(
        reply=result.reply,
        intent=result.intent,
        items=_cards(result.items),
        suggestion=result.suggestion,
    )


@router.get("/me/suggestions", response_model=SuggestionsOut, status_code=status.HTTP_200_OK)
def suggestions(
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> SuggestionsOut:
    """Suggested next posts (AC40): current, in-scope content the agent hasn't used yet."""
    pairs = tools.suggest_items(db, agent, now=now)
    return SuggestionsOut(items=_cards([ItemCard.of(e, now, reason=r) for e, r in pairs]))

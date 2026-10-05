"""Assistant + discovery routes (AC38–AC40) — agent-only, grounded in visible catalog content."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.agents import knowledge, tools
from app.agents.assistant import run_assistant
from app.agents.tools import ItemCard
from app.ai.factory import get_provider
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.user import Role, User
from app.observability import record_run, trace_span
from app.observability.tracing import elapsed_ms, monotonic_ms

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


class KnowledgeOut(BaseModel):
    domain: str
    items: list[ItemCardOut]
    note: str


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
    provider = get_provider(settings)
    start = monotonic_ms()
    ls = settings.langsmith_enabled()
    outcome, intent = "ok", ""
    try:
        with trace_span("assistant", enabled=ls, metadata={"actor": agent.id}):
            result = run_assistant(db, agent, body.message, provider, now=now)
        intent = result.intent
    except Exception:
        outcome = "error"
        raise
    finally:
        record_run(
            db, actor_id=agent.id, kind="assistant", intent=intent,
            tools=[intent] if intent else [], provider=provider.name,
            latency_ms=elapsed_ms(start), outcome=outcome,
        )
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


@router.get("/knowledge", response_model=KnowledgeOut)
def knowledge_search(
    q: str = Query(min_length=1, max_length=500),
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> KnowledgeOut:
    """Route a query to its knowledge domain; return scoped, hybrid-ranked results (AC43/AC44)."""
    provider = get_provider(settings)
    start = monotonic_ms()
    with trace_span("knowledge", enabled=settings.langsmith_enabled(), metadata={"a": agent.id}):
        result = knowledge.retrieve(db, agent, q, provider, now=now)
    record_run(
        db, actor_id=agent.id, kind="knowledge", intent=result.domain,
        tools=[result.domain], provider=provider.name, latency_ms=elapsed_ms(start),
    )
    return KnowledgeOut(
        domain=result.domain,
        items=_cards([ItemCard.of(e, now) for e in result.entries]),
        note=result.note,
    )

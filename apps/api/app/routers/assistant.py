"""Assistant + discovery routes (AC38–AC40) — agent-only, grounded in visible catalog content."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from dataclasses import asdict
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.agents import knowledge, tools
from app.agents.assistant import MAX_HISTORY, run_assistant, stream_assistant
from app.agents.tools import ItemCard
from app.ai.base import ChatMessage
from app.ai.factory import get_provider
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.user import Role, User
from app.observability import record_run, trace_span
from app.observability.tracing import elapsed_ms, monotonic_ms

router = APIRouter(tags=["assistant"])
logger = logging.getLogger("app.routers.assistant")

_agent_only = require_role(Role.tourism_agent)
# The chat assistant (AC57) is available to agents AND providers; each is grounded in the content
# they may browse (visibility.entries_for_actor). /me/suggestions + /knowledge stay agent-only.
_assistant_roles = require_role(Role.tourism_agent, Role.content_provider)


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    # Prior turns from the client-side chat (AC65); nothing is stored server-side.
    history: list[HistoryTurn] = Field(default_factory=list, max_length=20)


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
    agent: User = Depends(_assistant_roles),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> AssistantOut:
    """Ask the grounded Content Assistant (AC38/39/57). It only ever speaks about content the
    caller may browse — an agent's visible set, or a provider's own catalog."""
    provider = get_provider(settings)
    start = monotonic_ms()
    ls = settings.langsmith_enabled()
    outcome, intent = "ok", ""
    try:
        with trace_span("assistant", enabled=ls, metadata={"actor": agent.id}):
            history = [ChatMessage(t.role, t.text) for t in body.history[-MAX_HISTORY:]]
            result = run_assistant(db, agent, body.message, provider, now=now, history=history)
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


@router.post(
    "/assistant/stream",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
def assistant_stream(
    body: AssistantRequest,
    request: Request,
    agent: User = Depends(_assistant_roles),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> StreamingResponse:
    """The same assistant as ``POST /assistant``, streamed as server-sent events (AC65):
    ``delta`` events carry reply text as it is generated, then one ``done`` event carries the
    final (guarded) reply + cited item cards, which replaces the streamed text. On failure a
    single ``error`` event is sent instead of ``done``."""
    provider = get_provider(settings)
    history = [ChatMessage(t.role, t.text) for t in body.history[-MAX_HISTORY:]]
    actor_id = agent.id
    session_factory = request.app.state.sessionmaker

    def events() -> Iterator[str]:
        # The stream outlives the request's dependencies, so it owns its DB session.
        db = session_factory()
        start = monotonic_ms()
        outcome, intent = "ok", ""
        try:
            user = db.get(User, actor_id)
            with trace_span(
                "assistant", enabled=settings.langsmith_enabled(), metadata={"actor": actor_id}
            ):
                for event in stream_assistant(
                    db, user, body.message, provider, now=now, history=history
                ):
                    if event["type"] == "delta":
                        yield _sse({"type": "delta", "text": event["text"]})
                        continue
                    result = event["result"]
                    intent = result.intent
                    out = AssistantOut(
                        reply=result.reply,
                        intent=result.intent,
                        items=_cards(result.items),
                        suggestion=result.suggestion,
                    )
                    yield _sse({"type": "done", **out.model_dump()})
        except Exception as err:
            outcome = "error"
            logger.warning("assistant stream failed: %s", type(err).__name__)  # no message (C2)
            yield _sse({"type": "error", "message": "The assistant is unavailable right now."})
        finally:
            record_run(
                db, actor_id=actor_id, kind="assistant", intent=intent,
                tools=[intent] if intent else [], provider=provider.name,
                latency_ms=elapsed_ms(start), outcome=outcome,
            )
            db.close()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache", "x-accel-buffering": "no"},
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


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

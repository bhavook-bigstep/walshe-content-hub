"""Builder routes (AC10): prompt + selected items -> design (agent-only)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.agents.creative_plan import CreativeBrief, build_plan
from app.ai.builder import BuilderItem, build_design
from app.ai.factory import get_provider
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.user import Role, User
from app.observability import record_run, trace_span
from app.observability.tracing import elapsed_ms, monotonic_ms
from app.services.visibility import active_blocked_terms, agent_visible_entries_by_ids

router = APIRouter(prefix="/builder", tags=["builder"])

_agent_only = require_role(Role.tourism_agent)


class DesignRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    item_ids: list[int] = Field(min_length=1, max_length=50)


class PlanRequest(BaseModel):
    item_ids: list[int] = Field(min_length=1, max_length=50)
    objective: str = Field(default="awareness", max_length=120)
    format: str = Field(default="social", max_length=60)
    audience: str = Field(default="", max_length=160)


class ClaimSourceOut(BaseModel):
    claim: str
    grounded: bool
    evidence_item_id: int | None = None
    evidence_field: str | None = None


class CreativeCopyOut(BaseModel):
    headline: str
    body: str
    cta: str


class CreativePlanOut(BaseModel):
    item_ids: list[int]
    message_primary: str
    supporting_points: list[str]
    visual_asset_keys: list[str]
    ad_copy: CreativeCopyOut  # 'copy' would shadow BaseModel.copy
    sources: list[ClaimSourceOut]
    ready: bool
    issues: list[str]


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


@router.post("/plan", response_model=CreativePlanOut)
def plan(
    body: PlanRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> CreativePlanOut:
    """Build a grounded Creative Plan IR from selected items (AC41/AC42).

    Items are resolved through the visibility choke-point, so hidden/out-of-scope ids are dropped
    (Contract 1). The plan's claims are validated against the approved source fields.
    """
    rows = agent_visible_entries_by_ids(db, agent, body.item_ids, now=now)
    if not rows:
        raise HTTPException(status_code=404, detail="No visible catalog items")
    item_ids = [r.id for r in rows]
    brief = CreativeBrief(
        objective=body.objective, format=body.format, audience=body.audience, item_ids=item_ids
    )
    provider = get_provider(settings)
    start = monotonic_ms()
    ls = settings.langsmith_enabled()
    # Off-limits terms also screen the AI-rephrased copy (not just the source entries).
    with trace_span("creative_plan", enabled=ls, metadata={"a": agent.id}):
        result = build_plan(rows, brief, provider, blocked_terms=active_blocked_terms(db))
    record_run(
        db, actor_id=agent.id, kind="plan", intent="ready" if result.ready else "needs_review",
        tools=["creative_plan"], provider=provider.name, latency_ms=elapsed_ms(start),
    )
    return CreativePlanOut(
        item_ids=item_ids,
        message_primary=result.message_primary,
        supporting_points=result.supporting_points,
        visual_asset_keys=result.visual_asset_keys,
        ad_copy=CreativeCopyOut(**vars(result.copy)),
        sources=[ClaimSourceOut(**vars(s)) for s in result.sources],
        ready=result.ready,
        issues=result.issues,
    )

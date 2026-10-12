"""Studio agentic-ops routes — the PUBLIC, access-token-protected facade over the Node studio-ops
engine, so MCP + any host can discover and drive the Design Studio through one documented API.

The ops themselves run in the web app's Node service (one TS source of truth). This facade adds what
a public API needs and the engine leaves out: role/access-token auth, and Contract 1 GROUNDING — it
resolves the caller's `item_ids` through the visibility choke-point and hands the engine only the
approved catalog ids + their real image references, so a client can never smuggle an unapproved item
or a fabricated image source past it. FastAPI auto-documents these at ``/docs``.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.deps import get_db, require_role
from app.models.user import Role, User
from app.services.visibility import agent_visible_entries_by_ids

# Mounted under /ai-agent (see routers/ai_agent.py); tag inherited from that group.
router = APIRouter(prefix="/studio")

_agent_only = require_role(Role.tourism_agent)

# The Node studio-ops engine (the web app). Internal call; override per environment.
_STUDIO_OPS_BASE = os.environ.get("STUDIO_OPS_BASE", "http://localhost:3000")


# ── Node engine transport (module-level so tests can stub without a network) ──────────────────────
def _node_get(path: str) -> dict[str, Any]:
    with httpx.Client(timeout=10) as client:
        resp = client.get(f"{_STUDIO_OPS_BASE}{path}")
        resp.raise_for_status()
        return resp.json()


def _node_post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    with httpx.Client(timeout=30) as client:
        resp = client.post(f"{_STUDIO_OPS_BASE}{path}", json=payload)
        resp.raise_for_status()
        return resp.json()


# ── Schemas ───────────────────────────────────────────────────────────────────────────────────────
class StudioOpsApplyRequest(BaseModel):
    """Apply a sequence of agent op calls to a design. `item_ids` are the catalog entries the agent
    may reference; they are re-resolved through the visibility choke-point before the engine sees
    them."""

    design: dict[str, Any] = Field(description="the DesignDoc to edit (validated by the engine)")
    calls: list[dict[str, Any]] = Field(min_length=0, max_length=200, description="the op sequence")
    scene_index: int = Field(default=0, ge=0, description="the scene the ops target")
    item_ids: list[int] = Field(
        default_factory=list, max_length=50, description="catalog items the agent may use"
    )


class StudioOpResultOut(BaseModel):
    op: str
    status: str  # applied | rejected
    reason: str | None = None


class StudioOpsApplyResponse(BaseModel):
    design: dict[str, Any]
    results: list[StudioOpResultOut]
    valid: bool


class StudioOpSpecOut(BaseModel):
    op: str
    description: str
    params: dict[str, str]


class StudioOpsSpecResponse(BaseModel):
    ops: list[StudioOpSpecOut]


# ── Routes ────────────────────────────────────────────────────────────────────────────────────────
@router.get("/ops/spec", response_model=StudioOpsSpecResponse)
def studio_ops_spec(_: User = Depends(_agent_only)) -> dict[str, Any]:
    """The studio-ops tool catalog: op + description + params, for a host to build its tool list."""
    try:
        return _node_get("/api/studio-ops/spec")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc


@router.post("/ops/apply", response_model=StudioOpsApplyResponse)
def studio_ops_apply(
    body: StudioOpsApplyRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> dict[str, Any]:
    """Apply the op sequence server-side, grounded in the agent's VISIBLE catalog (Contract 1)."""
    # Resolve the allowed items + their real image references here — never trust the client's list.
    rows = agent_visible_entries_by_ids(db, agent, body.item_ids, now=now)
    allowed = [str(r.id) for r in rows]
    image_src_by_id: dict[str, str] = {}
    for r in rows:
        ref = r.cover_object_key or (r.asset_keys[0] if r.asset_keys else "")
        if ref:
            image_src_by_id[str(r.id)] = ref
    payload = {
        "design": body.design,
        "sceneIndex": body.scene_index,
        "calls": body.calls,
        "allowedCatalogIds": allowed,
        "imageSrcById": image_src_by_id,
    }
    try:
        return _node_post("/api/studio-ops/apply", payload)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc

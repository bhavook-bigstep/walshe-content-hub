"""Studio agentic-ops routes — the PUBLIC, access-token-protected facade over the Node studio-ops
engine, so MCP + any host can discover and drive the Design Studio through one documented API.

The ops themselves run in the web app's Node service (one TS source of truth). This facade adds what
a public API needs and the engine leaves out: role/access-token auth, and Contract 1 GROUNDING — it
resolves the caller's `item_ids` through the visibility choke-point and hands the engine only the
approved catalog ids + their real image references, so a client can never smuggle an unapproved item
or a fabricated image source past it. FastAPI auto-documents these at ``/docs``.
"""

from __future__ import annotations

import json
import os
import queue
import threading
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.ai.content_plan import generate_content_plan
from app.ai.factory import get_provider
from app.ai.sprite_gen import generate_sprite
from app.ai.studio_agent import AgentItem, run_studio_agent
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.user import Role, User
from app.services.visibility import agent_visible_entries_by_ids
from app.storage.minio_client import Storage


def _get_storage(request: Request) -> Storage:
    return request.app.state.storage

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


def _resolve_grounding(rows: list[Any]) -> tuple[list[str], dict[str, str]]:
    """The agent's VISIBLE ids + their real image refs — resolved here, never trusted from a client
    (Contract 1). An approved item with no image yields an allowed id but no src, so `place` can't
    fabricate one."""
    allowed = [str(r.id) for r in rows]
    image_src_by_id: dict[str, str] = {}
    for r in rows:
        ref = r.cover_object_key or (r.asset_keys[0] if r.asset_keys else "")
        if ref:
            image_src_by_id[str(r.id)] = ref
    return allowed, image_src_by_id


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
    rows = agent_visible_entries_by_ids(db, agent, body.item_ids, now=now)
    allowed, image_src_by_id = _resolve_grounding(rows)
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


class StudioObserveRequest(BaseModel):
    """Observe a design in words — an accurate per-scene description derived from its state."""

    design: dict[str, Any] = Field(description="the DesignDoc to observe")
    scene_index: int | None = Field(default=None, ge=0, description="one scene (omit = all scenes)")
    item_ids: list[int] = Field(
        default_factory=list, max_length=50, description="catalog items, to label images by title"
    )


@router.post("/ops/observe")
def studio_ops_observe(
    body: StudioObserveRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> dict[str, Any]:
    """Derive the natural-language description of each scene (read-only) so a host can OBSERVE the
    workspace in words instead of analysing a render. Images are labelled by their catalog title."""
    rows = agent_visible_entries_by_ids(db, agent, body.item_ids, now=now)
    labels = {str(r.id): r.title for r in rows}
    payload: dict[str, Any] = {"design": body.design, "labelsById": labels}
    if body.scene_index is not None:
        payload["sceneIndex"] = body.scene_index
    try:
        return _node_post("/api/studio-ops/observe", payload)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc


class StudioGenerateSpriteRequest(BaseModel):
    """Generate an animated sprite from a concept via the image API; store it as an owner sprite."""

    concept: str = Field(min_length=1, max_length=500, description="what the sprite shows + motion")
    frames: int = Field(default=4, ge=2, le=8, description="how many motion frames to generate")
    fps: int = Field(default=10, ge=1, le=30, description="playback speed")


@router.post("/sprites/generate")
def studio_generate_sprite(
    body: StudioGenerateSpriteRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(_get_storage),
) -> dict[str, Any]:
    """Generate a sprite sheet (LLM image), slice it via the shared pipeline, and persist it as the
    caller's sprite. Returns the owner sprite + its `user:<id>` ref to place with `add-sprite`.
    Generated sprites are unmoderated decorative content."""
    try:
        gen = generate_sprite(
            settings, db, storage, agent.id, body.concept,
            frames=body.frames, fps=body.fps,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    s = gen.sprite
    return {
        "ref": f"user:{s.id}",
        "provider": gen.provider,
        "sprite": {
            "id": s.id, "name": s.name, "fps": s.fps,
            "frame_width": s.frame_width, "frame_height": s.frame_height,
            "frame_keys": s.frame_keys,
        },
    }


class StudioPlanRequest(BaseModel):
    """A vague brief → a scene-by-scene content plan the user edits, then runs as a brief."""

    prompt: str = Field(min_length=1, max_length=2000, description="the vague creative brief")
    item_ids: list[int] = Field(
        default_factory=list, max_length=50, description="catalog items to ground the plan in"
    )


class StudioPlanResponse(BaseModel):
    plan: str
    provider: str


@router.post("/plan", response_model=StudioPlanResponse)
def studio_plan(
    body: StudioPlanRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> dict[str, Any]:
    """Turn a vague brief into a concrete, scene-by-scene markdown content plan, grounded in the
    agent's visible catalog. The user edits it, then runs it as the Builder's prompt."""
    rows = agent_visible_entries_by_ids(db, agent, body.item_ids, now=now)
    items = [
        AgentItem(id=r.id, title=r.title, destination=r.destination or "") for r in rows
    ]
    provider = get_provider(settings)
    plan = generate_content_plan(provider, body.prompt, items)
    return {"plan": plan, "provider": provider.name}


# ── Inbuilt agent loop ────────────────────────────────────────────────────────────────────────────
class StudioAgentRequest(BaseModel):
    """Run the inbuilt Builder agent: edit `design` to satisfy `prompt`, grounded in `item_ids`."""

    design: dict[str, Any] = Field(description="the DesignDoc to edit")
    prompt: str = Field(min_length=1, max_length=2000, description="the creative brief")
    item_ids: list[int] = Field(
        default_factory=list, max_length=50, description="catalog items the agent may use"
    )
    scene_index: int = Field(default=0, ge=0, description="the scene the agent edits")
    max_rounds: int = Field(default=10, ge=1, le=16, description="tool-loop budget")


class StudioAgentResponse(BaseModel):
    design: dict[str, Any]
    steps: list[dict[str, Any]]  # the loop transcript (describe_ops / apply / finish)
    applied: int
    finished: bool
    provider: str


def _build_agent_runtime(
    agent: User,
    db: Session,
    settings: Settings,
    storage: Storage,
    item_ids: list[int],
    now: datetime,
    *,
    sprite_session: Session | None = None,
) -> dict[str, Any]:
    """Resolve grounding + build the apply/observe/generate fns the agent loop needs.

    ``sprite_session`` (a fresh session) is used for sprite generation when the loop runs off the
    request thread (SQLAlchemy sessions aren't shared across threads).
    """
    rows = agent_visible_entries_by_ids(db, agent, item_ids, now=now)
    allowed, image_src_by_id = _resolve_grounding(rows)
    items = [AgentItem(id=r.id, title=r.title, destination=r.destination or "") for r in rows]
    labels = {str(r.id): r.title for r in rows}
    # Sprites the agent generates this run, by ref → frames+size; threaded into every apply.
    generated_sprites: dict[str, dict[str, Any]] = {}
    sprite_db = sprite_session or db

    def apply_fn(
        design: dict[str, Any], calls: list[dict[str, Any]], scene_index: int
    ) -> dict[str, Any]:
        payload = {
            "design": design,
            "sceneIndex": scene_index,
            "calls": calls,
            "allowedCatalogIds": allowed,
            "imageSrcById": image_src_by_id,
            "spriteFramesById": generated_sprites,
        }
        try:
            return _node_post("/api/studio-ops/apply", payload)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc

    def observe_fn(design: dict[str, Any], scene_index: int | None) -> dict[str, Any]:
        payload: dict[str, Any] = {"design": design, "labelsById": labels}
        if scene_index is not None:
            payload["sceneIndex"] = scene_index
        try:
            return _node_post("/api/studio-ops/observe", payload)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc

    def generate_sprite_fn(concept: str, opts: dict[str, Any]) -> dict[str, Any]:
        gen = generate_sprite(
            settings, sprite_db, storage, agent.id, concept,
            frames=int(opts.get("frames", 4) or 4), fps=int(opts.get("fps", 10) or 10),
        )
        ref = f"user:{gen.sprite.id}"
        generated_sprites[ref] = {
            "frames": gen.frames_data_urls, "fps": gen.sprite.fps,
            "width": gen.sprite.frame_width, "height": gen.sprite.frame_height,
        }
        return {
            "ref": ref, "frame_count": len(gen.frames_data_urls), "fps": gen.sprite.fps,
            "width": gen.sprite.frame_width, "height": gen.sprite.frame_height,
        }

    try:
        spec = _node_get("/api/studio-ops/spec").get("ops", [])
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc

    return {
        "items": items, "spec": spec, "apply_fn": apply_fn,
        "observe_fn": observe_fn, "generate_sprite_fn": generate_sprite_fn,
    }


@router.post("/agent", response_model=StudioAgentResponse)
def studio_agent(
    body: StudioAgentRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(_get_storage),
    now: datetime = Depends(clock.now),
) -> dict[str, Any]:
    """Run the server tool loop (progressive op disclosure) over the grounded studio-ops engine.

    The op param schemas live in the engine spec and reach the model only via the loop's
    `describe_ops` step — the system prompt carries just the op index, to spare the context window.
    """
    runtime = _build_agent_runtime(agent, db, settings, storage, body.item_ids, now)
    result = run_studio_agent(
        design=body.design,
        prompt=body.prompt,
        items=runtime["items"],
        spec=runtime["spec"],
        provider=get_provider(settings),
        apply_fn=runtime["apply_fn"],
        observe_fn=runtime["observe_fn"],
        generate_sprite_fn=runtime["generate_sprite_fn"],
        scene_index=body.scene_index,
        max_rounds=body.max_rounds,
    )
    return {
        "design": result.design,
        "steps": result.steps,
        "applied": result.applied,
        "finished": result.finished,
        "provider": result.provider,
    }


@router.post("/agent/stream")
def studio_agent_stream(
    request: Request,
    body: StudioAgentRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(_get_storage),
    now: datetime = Depends(clock.now),
) -> StreamingResponse:
    """The agent build, streamed as SSE so the UI can show the agent's live "thinking". Emits one
    `{"t":"step", ...}` event per action (with its note) and a final `{"t":"done", design, ...}`."""
    # Grounding is resolved on THIS (request) session now; the loop runs in a worker thread, so its
    # sprite generation gets a fresh session (SQLAlchemy sessions aren't shared across threads).
    sprite_session = request.app.state.sessionmaker()
    runtime = _build_agent_runtime(
        agent, db, settings, storage, body.item_ids, now, sprite_session=sprite_session
    )
    provider = get_provider(settings)
    events: queue.Queue = queue.Queue()
    _DONE = object()
    holder: dict[str, Any] = {}

    def run() -> None:
        try:
            holder["result"] = run_studio_agent(
                design=body.design, prompt=body.prompt, items=runtime["items"],
                spec=runtime["spec"], provider=provider, apply_fn=runtime["apply_fn"],
                observe_fn=runtime["observe_fn"], generate_sprite_fn=runtime["generate_sprite_fn"],
                scene_index=body.scene_index, max_rounds=body.max_rounds,
                on_step=events.put,
            )
        except Exception as exc:  # noqa: BLE001 — surfaced to the client as an error event
            holder["error"] = exc
        finally:
            events.put(_DONE)

    def sse() -> Any:
        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        try:
            while True:
                item = events.get()
                if item is _DONE:
                    break
                yield f"data: {json.dumps({'t': 'step', **item})}\n\n"
            worker.join()
            res = holder.get("result")
            if res is None:
                yield f"data: {json.dumps({'t': 'error'})}\n\n"
            else:
                yield "data: " + json.dumps({
                    "t": "done", "design": res.design, "applied": res.applied,
                    "finished": res.finished, "provider": res.provider,
                }) + "\n\n"
        finally:
            sprite_session.close()

    return StreamingResponse(sse(), media_type="text/event-stream")

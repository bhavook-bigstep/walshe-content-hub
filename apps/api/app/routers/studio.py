"""Studio agentic-ops routes — the PUBLIC, access-token-protected facade over the Node studio-ops
engine, so MCP + any host can discover and drive the Design Studio through one documented API.

The ops themselves run in the web app's Node service (one TS source of truth). This facade adds what
a public API needs and the engine leaves out: role/access-token auth, and Contract 1 GROUNDING — it
resolves the caller's `item_ids` through the visibility choke-point and hands the engine only the
approved catalog ids + their real image references, so a client can never smuggle an unapproved item
or a fabricated image source past it. FastAPI auto-documents these at ``/docs``.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import queue
import threading
import uuid
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import clock
from app.ai.content_plan import generate_content_plan
from app.ai.factory import get_provider
from app.ai.images import generate_image as _generate_image
from app.ai.sprite_gen import generate_sprite
from app.ai.studio_agent import AgentItem
from app.ai.studio_critic import run_critic_loop
from app.ai.studio_graph import run_studio_graph
from app.ai.vision import critique_scene
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.catalog import ItemKind, UserAsset, UserAssetSource
from app.models.user import Role, User
from app.observability.tracing import traced
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


MAX_VISUAL_OBSERVES = 3
_SEVERITY_MAP = {"fail": "P1", "warn": "P2", "info": "P3"}


def _data_url_bytes(url: str) -> bytes:
    """Decode a ``data:image/png;base64,...`` URL from the render engine (bad input -> empty)."""
    try:
        return base64.b64decode(url.split(",", 1)[-1], validate=True)
    except (ValueError, AttributeError):
        return b""


def _critique_frames(
    settings: Settings, pngs: list[bytes], mode: str, extra: list[Any]
) -> dict[str, Any]:
    """Vision critique of rendered frames, shaped for both consumers: the raw vision result
    (observe_visual) plus ``findings`` / ``verifications`` (the critic loop, AC103).

    The critic sees only the images + its checklist (``extra`` dicts tagged by kind) — never the
    brief or design. The stub is keyed on the frames' hash, so it is deterministic (Contract 4).
    """
    checklist: list[str] = []
    prior_ids: list[str] = []
    for e in extra:
        if isinstance(e, dict) and e.get("kind") == "checklist":
            checklist = [str(i) for i in e.get("items") or []]
        elif isinstance(e, dict) and e.get("kind") == "verify":
            prior_ids += [str(f.get("id")) for f in e.get("findings") or [] if isinstance(f, dict)]
    key = [hashlib.sha256(p).hexdigest() for p in pngs]
    res = critique_scene(settings, pngs, checklist or None, mode, scene=key)
    findings = [
        {
            "id": f"v-{i['category']}", "severity": _SEVERITY_MAP.get(i["severity"], "P2"),
            "region": None, "issue": i["note"], "fix": {},
        }
        for i in res.get("issues") or []
    ]
    current = {f["id"] for f in findings}
    verifications = [
        {"id": pid, "status": "not" if pid in current else "fixed"} for pid in prior_ids
    ]
    return {**res, "findings": findings, "verifications": verifications}


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
    prompt: str = Field(min_length=1, max_length=8000, description="the creative brief (or a plan)")
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
    # Static images the agent generates this run, by ref → {src, objectKey, size}; threaded into
    # every apply so `add-image` can place them. (The agent no longer generates frame-by-frame
    # sprites — it produced incoherent frames; it makes one still and animates it with keyframes.)
    generated_images: dict[str, dict[str, Any]] = {}
    worker_db = sprite_session or db  # off-thread session for generated-asset persistence

    @traced("studio-ops.apply", "tool")
    def apply_fn(
        design: dict[str, Any], calls: list[dict[str, Any]], scene_index: int
    ) -> dict[str, Any]:
        payload = {
            "design": design,
            "sceneIndex": scene_index,
            "calls": calls,
            "allowedCatalogIds": allowed,
            "imageSrcById": image_src_by_id,
            "generatedImagesById": generated_images,
        }
        try:
            return _node_post("/api/studio-ops/apply", payload)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc

    @traced("studio-ops.observe", "tool")
    def observe_fn(design: dict[str, Any], scene_index: int | None) -> dict[str, Any]:
        payload: dict[str, Any] = {"design": design, "labelsById": labels}
        if scene_index is not None:
            payload["sceneIndex"] = scene_index
        try:
            return _node_post("/api/studio-ops/observe", payload)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc

    @traced("studio-ops.render", "tool")
    def render_fn(
        design: dict[str, Any], scene_index: int, times: list[int] | None
    ) -> dict[str, Any]:
        # Same Contract-1 choke-point as apply: the engine re-checks every image node against the
        # server-resolved ids/srcs (never client-supplied) BEFORE launching a browser.
        payload: dict[str, Any] = {
            "design": design,
            "sceneIndex": scene_index,
            "allowedCatalogIds": allowed,
            "imageSrcById": image_src_by_id,
        }
        if times is not None:
            payload["times"] = times
        try:
            res = _node_post("/api/studio-ops/render", payload)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc
        return {**res, "pngs": [_data_url_bytes(p) for p in res.get("pngs") or []]}

    @traced("studio-ops.critique", "tool")
    def critique_fn(pngs: list[bytes], mode: str, extra: list[Any]) -> dict[str, Any]:
        return _critique_frames(settings, pngs, mode, extra)

    @traced("studio-ops.generate-image", "tool")
    def generate_image_fn(concept: str, _opts: dict[str, Any]) -> dict[str, Any]:
        # One still image from the configured model (deterministic stub when no key — Contract 4),
        # persisted as the agent's OWN asset so the placed node re-resolves on reload (its src is a
        # real owned object, never a fabricated catalog src — Contract 1).
        picture = _generate_image(settings, concept)
        key = f"users/{agent.id}/{uuid.uuid4().hex}"
        storage.put_object(key, picture.data, picture.content_type)
        asset = UserAsset(
            owner_id=agent.id, source=UserAssetSource.agent, kind=ItemKind.image,
            title=concept.strip()[:120] or "Generated image",
            object_key=key, content_type=picture.content_type,
        )
        worker_db.add(asset)
        worker_db.commit()
        worker_db.refresh(asset)
        try:
            with Image.open(io.BytesIO(picture.data)) as im:
                width, height = im.size
        except Exception:  # noqa: BLE001 - dims are a hint; the op defaults if absent
            width = height = None
        ref = f"gen:{asset.id}"
        src = "data:" + picture.content_type + ";base64," + base64.b64encode(picture.data).decode()
        size = {"width": width, "height": height} if width and height else {}
        generated_images[ref] = {"src": src, "objectKey": key, **size}
        return {"ref": ref, "object_key": key, **size}

    try:
        spec = _node_get("/api/studio-ops/spec").get("ops", [])
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="studio-ops engine unavailable") from exc

    return {
        "items": items, "spec": spec, "apply_fn": apply_fn,
        "observe_fn": observe_fn, "generate_image_fn": generate_image_fn,
        "render_fn": render_fn, "critique_fn": critique_fn,
    }


def _run_build(
    settings: Settings, runtime: dict[str, Any], body: StudioAgentRequest, **extra: Any
) -> Any:
    """Build with a live observe_visual, then the bounded independent critic loop (AC103)."""
    # run_critic_loop consumes render_fn/critique_fn itself, so bind them into the build too —
    # that is what makes the Builder's observe_visual tool live.
    def build(**kw: Any) -> Any:
        return run_studio_graph(
            max_rounds=body.max_rounds, render_fn=runtime["render_fn"],
            critique_fn=runtime["critique_fn"], max_visual_observes=MAX_VISUAL_OBSERVES, **kw,
        )

    if (settings.ai_provider or "").lower() != "gemini" or not settings.gemini_api_key:
        # Deterministic stub compose (Contract 4): nothing visual to review, and no browser needed.
        return build(
            settings=settings, design=body.design, prompt=body.prompt, items=runtime["items"],
            spec=runtime["spec"], apply_fn=runtime["apply_fn"], observe_fn=runtime["observe_fn"],
            generate_image_fn=runtime["generate_image_fn"], scene_index=body.scene_index, **extra,
        )
    out = run_critic_loop(
        settings=settings,
        design=body.design,
        prompt=body.prompt,
        items=runtime["items"],
        spec=runtime["spec"],
        apply_fn=runtime["apply_fn"],
        observe_fn=runtime["observe_fn"],
        generate_image_fn=runtime["generate_image_fn"],
        render_fn=runtime["render_fn"],
        critique_fn=runtime["critique_fn"],
        # max_rounds here is the BUILD loop's budget; the critic's own round cap stays its default.
        build_fn=build,
        scene_index=body.scene_index,
        **extra,
    )
    return out.result


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
    result = _run_build(settings, runtime, body)
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
    # generated-image persistence gets a fresh session (SQLAlchemy sessions aren't shared across
    # threads).
    sprite_session = request.app.state.sessionmaker()
    runtime = _build_agent_runtime(
        agent, db, settings, storage, body.item_ids, now, sprite_session=sprite_session
    )
    events: queue.Queue = queue.Queue()
    _DONE = object()
    holder: dict[str, Any] = {}

    def run() -> None:
        try:
            holder["result"] = _run_build(settings, runtime, body, on_step=events.put)
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

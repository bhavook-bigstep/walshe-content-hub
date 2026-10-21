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
import io
import json
import logging
import os
import queue
import threading
import time
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
from app.ai.sprite_gen import generate_sprite, remove_white_bg
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
logger = logging.getLogger("app.routers.studio")

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

# ── Live build drafts ────────────────────────────────────────────────────────────────────────────
# A build runs in a background thread and writes its evolving design here; the browser POLLS the
# draft and re-renders when `version` changes — instead of holding a long SSE connection that a slow
# review/critic pass (minutes) would drop through the dev proxy. In-memory + a lock is fine for the
# single-process PoC (a multi-worker deployment would move this to Redis/DB). Owner-scoped. Drafts
# are evicted after they finish + age out so the dict can't grow without bound.
_DRAFTS: dict[str, dict[str, Any]] = {}
_DRAFTS_LOCK = threading.Lock()
_DRAFT_TTL_S = 900  # keep a finished draft 15 min so a slow poll still fetches the final design


def _draft_evict_old() -> None:
    now = time.monotonic()
    for bid, d in list(_DRAFTS.items()):
        if d.get("finished") and now - d.get("done_at", now) > _DRAFT_TTL_S:
            _DRAFTS.pop(bid, None)


def _draft_update(build_id: str, *, bump: bool = True, **fields: Any) -> None:
    """Merge fields into a draft (under the lock); `bump` advances the version the browser polls."""
    with _DRAFTS_LOCK:
        d = _DRAFTS.get(build_id)
        if d is None:
            return
        d.update(fields)
        if bump:
            d["version"] = int(d.get("version", 0)) + 1
        if d.get("finished"):
            d["done_at"] = time.monotonic()


def _data_url_bytes(url: str) -> bytes:
    """Decode a ``data:image/png;base64,...`` URL from the render engine (bad input -> empty)."""
    try:
        return base64.b64decode(url.split(",", 1)[-1], validate=True)
    except (ValueError, AttributeError):
        return b""


def _critique_frames(
    settings: Settings, pngs: list[bytes], mode: str, extra: list[Any], scene: Any = None
) -> dict[str, Any]:
    """Vision critique of rendered frames, shaped for both consumers: the raw vision result
    (observe_visual) plus ``findings`` / ``verifications`` (the critic loop, AC103).

    The critic sees only the images + its checklist (``extra`` dicts tagged by kind) — never the
    brief or design. ``scene`` is the scene JSON, passed to ``critique_scene`` ONLY to key the
    deterministic no-key stub: scene JSON is stable across environments, whereas headless-Chromium
    PNG bytes drift by Chromium build/font/platform, so keying the stub on pixels would break the
    cross-env reproducibility the stub exists to guarantee (Contract 4 / AC102b). The real vision
    model never receives ``scene``.
    """
    checklist: list[str] = []
    prior_ids: list[str] = []
    for e in extra:
        if isinstance(e, dict) and e.get("kind") == "checklist":
            checklist = [str(i) for i in e.get("items") or []]
        elif isinstance(e, dict) and e.get("kind") == "verify":
            prior_ids += [str(f.get("id")) for f in e.get("findings") or [] if isinstance(f, dict)]
    res = critique_scene(settings, pngs, checklist or None, mode, scene=scene)
    # Unique id per issue (index + category): two issues sharing a category must not collapse to the
    # same id. `region` carries the critic's free-text LOCATION so the fix round maps it to a node.
    findings = [
        {
            "id": f"v{idx}-{i['category']}", "severity": _SEVERITY_MAP.get(i["severity"], "P2"),
            "region": i.get("location") or None, "issue": i["note"], "fix": {},
        }
        for idx, i in enumerate(res.get("issues") or [])
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
    max_rounds: int = Field(default=10, ge=1, le=80, description="max model turns in the loop")
    project_id: str | None = Field(
        default=None, max_length=128,
        description="the workspace/project this build belongs to (labels the trace thread)",
    )
    run_code: str | None = Field(
        default=None, max_length=64,
        description="a per-build-click id minted by the client so a retried/fallen-back request "
        "stays ONE trace thread (<project>:<run_code>) instead of minting a new one each time",
    )


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
    # A SQLAlchemy Session is NOT thread-safe, and in the /agent/stream path `worker_db` is ONE
    # session shared by every worker thread. LangGraph's ToolNode runs a turn's tool calls (incl.
    # generate_image + apply) CONCURRENTLY, so parallel calls would hit the same Session — and the
    # same `generated_images` dict — at once: the shared-state-under-concurrency incident
    # `.claude/rules/critical-patterns.md` documents, reintroduced in the DB + dict layers. This
    # lock serialises BOTH the Session read-modify-write (incl. rollback) AND every read/write of
    # the shared `generated_images` dict; the slow image gen + storage put stay OUTSIDE it.
    worker_db_lock = threading.Lock()

    @traced("studio-ops.apply", "tool")
    def apply_fn(
        design: dict[str, Any], calls: list[dict[str, Any]], scene_index: int
    ) -> dict[str, Any]:
        # Snapshot `generated_images` UNDER the lock: a concurrent generate_image (ToolNode runs a
        # turn's tool calls in parallel) may insert a new ref, and json-serialising the live dict in
        # `_node_post` would then raise "dictionary changed size during iteration". The inner dicts
        # are never mutated after insertion, so a shallow copy is a safe, stable payload.
        with worker_db_lock:
            generated_snapshot = dict(generated_images)
        payload = {
            "design": design,
            "sceneIndex": scene_index,
            "calls": calls,
            "allowedCatalogIds": allowed,
            "imageSrcById": image_src_by_id,
            "generatedImagesById": generated_snapshot,
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
    def critique_fn(
        pngs: list[bytes], mode: str, extra: list[Any], scene: Any = None
    ) -> dict[str, Any]:
        return _critique_frames(settings, pngs, mode, extra, scene)

    @traced("studio-ops.generate-image", "tool")
    def generate_image_fn(concept: str, _opts: dict[str, Any]) -> dict[str, Any]:
        # One still image from the configured model (deterministic stub when no key — Contract 4),
        # persisted as the agent's OWN asset so the placed node re-resolves on reload (its src is a
        # real owned object, never a fabricated catalog src — Contract 1).
        # `cutout`: steer the model to a solid-white background, then KEY IT OUT locally (Pillow,
        # no external service) → a transparent PNG that layers cleanly over other elements. Image
        # models won't emit clean alpha directly, but they honour a white bg we can remove.
        cutout = bool(_opts.get("cutout"))
        gen_prompt = (
            f"{concept.strip()}. A single subject, centred and fully in view, flat art on a plain "
            "solid pure-white background (#FFFFFF, no gradient or shadow), no text, no borders."
        ) if cutout else concept
        picture = _generate_image(settings, gen_prompt)  # slow network gen — outside the lock
        data, content_type = picture.data, picture.content_type
        if cutout:
            try:
                with Image.open(io.BytesIO(data)) as im:
                    buf = io.BytesIO()
                    remove_white_bg(im).save(buf, format="PNG")
                    data, content_type = buf.getvalue(), "image/png"
            except Exception:  # noqa: BLE001 - if keying fails, fall back to the opaque image
                logger.info("cutout: white-bg removal failed; using the opaque image")
        key = f"users/{agent.id}/{uuid.uuid4().hex}"
        storage.put_object(key, data, content_type)  # slow I/O — outside the lock
        asset = UserAsset(
            owner_id=agent.id, source=UserAssetSource.agent, kind=ItemKind.image,
            title=concept.strip()[:120] or "Generated image",
            object_key=key, content_type=content_type,
        )
        # Only the Session read-modify-write is serialised; `asset.id` is read under the lock too so
        # no post-commit lazy load races another thread's Session use. On a commit failure, roll the
        # shared Session back INSIDE the lock: without it one failure leaves the session in
        # pending-rollback state and poisons every later concurrent generate_image this turn
        # (PendingRollbackError cascade), since in /agent/stream `worker_db` is one shared session.
        with worker_db_lock:
            try:
                worker_db.add(asset)
                worker_db.commit()
                worker_db.refresh(asset)
                asset_id = asset.id
            except Exception:
                worker_db.rollback()
                raise
        try:
            with Image.open(io.BytesIO(data)) as im:
                width, height = im.size
        except Exception:  # noqa: BLE001 - dims are a hint; the op defaults if absent
            width = height = None
        ref = f"gen:{asset_id}"
        src = "data:" + content_type + ";base64," + base64.b64encode(data).decode()
        size = {"width": width, "height": height} if width and height else {}
        # Guard the shared `generated_images` write with the SAME lock so apply_fn's snapshot above
        # can never observe a half-written dict mid-insert (see apply_fn's comment).
        with worker_db_lock:
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
    # One build == one trace thread, named <project>:<run-code>: the project/workspace id (so you
    # see which board a run worked on) + a short unique code per run. Every turn, tool, review and
    # fix of this build shares it, so the whole build reads as one ordered thread in LangSmith.
    # Prefer the client-minted run_code so a build's stream + any buffered fallback/retry stay ONE
    # thread; only mint server-side when the client didn't send one.
    run_code = (body.run_code or "").strip()[:64] or uuid.uuid4().hex[:8]
    thread_id = f"{(body.project_id or 'studio').strip()[:64]}:{run_code}"
    if extra.get("on_step"):
        extra["on_step"]({"action": "run", "note": f"Build {thread_id}"})

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
        thread_id=thread_id,
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


@router.post("/agent/start")
def studio_agent_start(
    request: Request,
    body: StudioAgentRequest,
    agent: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(_get_storage),
    now: datetime = Depends(clock.now),
) -> dict[str, Any]:
    """Start a build in the background and return its `build_id`. The build writes its evolving
    design into a server-side DRAFT; the browser polls `GET /agent/draft/{build_id}` and re-renders
    on each version bump — no long-lived SSE connection a slow review/critic pass could drop (so one
    build is always one trace thread). The loop runs off-thread, so it gets its own DB session."""
    worker_session = request.app.state.sessionmaker()
    runtime = _build_agent_runtime(
        agent, db, settings, storage, body.item_ids, now, sprite_session=worker_session
    )
    run_code = (body.run_code or "").strip()[:64] or uuid.uuid4().hex[:8]
    build_id = f"{(body.project_id or 'studio').strip()[:64]}:{run_code}"
    with _DRAFTS_LOCK:
        _draft_evict_old()
        _DRAFTS[build_id] = {
            "owner": agent.id, "design": body.design, "version": 0, "status": "running",
            "applied": 0, "finished": False, "note": "Starting…", "cancel": False,
            "provider": "", "updated": time.monotonic(),
        }

    def on_step(step: dict[str, Any]) -> None:
        fields: dict[str, Any] = {}
        if step.get("design") is not None:
            fields["design"] = step["design"]
        if step.get("note"):
            fields["note"] = step["note"]
        _draft_update(build_id, bump=bool(fields), **fields)

    def cancel_check() -> bool:
        with _DRAFTS_LOCK:
            d = _DRAFTS.get(build_id)
            return bool(d and d.get("cancel"))

    def run() -> None:
        try:
            result = _run_build(settings, runtime, body, on_step=on_step, cancel_check=cancel_check)
            cancelled = cancel_check()
            _draft_update(
                build_id, design=result.design, applied=result.applied, finished=True,
                provider=result.provider,
                status="cancelled" if cancelled else "done",
                note="Build cancelled" if cancelled else "Build complete",
            )
        except Exception as exc:  # noqa: BLE001 — surfaced to the client via the draft status
            logger.info("studio build %s failed: %s", build_id, type(exc).__name__)
            _draft_update(build_id, finished=True, status="error", note="Build failed")
        finally:
            worker_session.close()

    threading.Thread(target=run, daemon=True).start()
    return {"build_id": build_id}


@router.get("/agent/draft/{build_id:path}")
def studio_agent_draft(
    build_id: str, agent: User = Depends(_agent_only)
) -> dict[str, Any]:
    """The current draft for a running/finished build — the browser polls this and re-renders when
    `version` changes. Owner-scoped (404 for anyone else's build, or an unknown/evicted id)."""
    with _DRAFTS_LOCK:
        d = _DRAFTS.get(build_id)
        if d is None or d.get("owner") != agent.id:
            raise HTTPException(status_code=404, detail="build not found")
        return {
            "build_id": build_id, "design": d["design"], "version": d["version"],
            "status": d["status"], "finished": d["finished"], "applied": d["applied"],
            "note": d.get("note"), "provider": d.get("provider", ""),
        }


@router.post("/agent/cancel/{build_id:path}")
def studio_agent_cancel(
    build_id: str, agent: User = Depends(_agent_only)
) -> dict[str, Any]:
    """Ask a running build to stop (the loop checks between turns/rounds and leaves what it built).
    Idempotent; owner-scoped."""
    with _DRAFTS_LOCK:
        d = _DRAFTS.get(build_id)
        if d is None or d.get("owner") != agent.id:
            raise HTTPException(status_code=404, detail="build not found")
        d["cancel"] = True
    return {"ok": True}

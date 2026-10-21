"""Studio agentic-ops facade — access-token auth + Contract 1 grounding over the Node engine.

The Node engine is stubbed (no network); these assert the FACADE's job: role auth, and resolving the
caller's item_ids through the visibility choke-point into the approved ids + real image refs it
hands the engine (so an unapproved/hidden item can never reach it).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.user import Role
from app.routers import studio as studio_router
from tests.conftest import auth_header

_DESIGN = {
    "format": "social",
    "width": 1080,
    "height": 1080,
    "scenes": [
        {"id": "s1", "name": "Scene 1", "durationMs": 4000, "transition": "none", "nodes": []}
    ],
}


def _seed(app, title, *, approved=True, safe=True, cover="", tenants=None, agents=None) -> int:
    with app.state.sessionmaker() as db:
        e = CatalogEntry(
            type=CatalogType.event,
            title=title,
            description="",
            destination="Testshire",
            status=EntryStatus.approved if approved else EntryStatus.draft,
            brand_safe=safe,
            cover_object_key=cover,
            allowed_tenant_ids=tenants or [],
            allowed_agent_ids=agents or [],
            provider_id=1,
        )
        db.add(e)
        db.commit()
        return e.id


@pytest.fixture
def stub_node(monkeypatch):
    """Replace the Node engine transport with a recording stub (no network)."""
    seen: dict = {}

    def fake_post(path, payload):
        seen["post"] = (path, payload)
        return {
            "design": payload["design"],
            "results": [{"op": c.get("op", "?"), "status": "applied"} for c in payload["calls"]],
            "valid": True,
        }

    def fake_get(path):
        seen["get"] = path
        return {"ops": [{"op": "place", "description": "place an item", "params": {}}]}

    monkeypatch.setattr(studio_router, "_node_post", fake_post)
    monkeypatch.setattr(studio_router, "_node_get", fake_get)
    return seen


def test_studio_ops_spec_is_agent_only(app, stub_node):
    with TestClient(app) as c:
        provider = auth_header(c, Role.content_provider)
        assert c.get("/ai-agent/studio/ops/spec").status_code == 401
        assert c.get("/ai-agent/studio/ops/spec", headers=provider).status_code == 403
        r = c.get("/ai-agent/studio/ops/spec", headers=auth_header(c, Role.tourism_agent))
        assert r.status_code == 200
        assert any(o["op"] == "place" for o in r.json()["ops"])


def test_studio_ops_apply_is_agent_only(app, stub_node):
    body = {"design": _DESIGN, "calls": [], "item_ids": []}
    with TestClient(app) as c:
        provider = auth_header(c, Role.content_provider)
        agent = auth_header(c, Role.tourism_agent)
        assert c.post("/ai-agent/studio/ops/apply", json=body).status_code == 401
        assert c.post("/ai-agent/studio/ops/apply", json=body, headers=provider).status_code == 403
        assert c.post("/ai-agent/studio/ops/apply", json=body, headers=agent).status_code == 200


def test_studio_ops_apply_grounds_item_ids_through_visibility(app, stub_node):
    ok = _seed(app, "Visible Tour", cover="assets/ok.png")
    draft = _seed(app, "Draft Secret", approved=False)
    unsafe = _seed(app, "Unsafe Secret", safe=False)
    bogus = 987654
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        r = c.post(
            "/ai-agent/studio/ops/apply",
            headers=agent,
            json={
                "design": _DESIGN,
                "scene_index": 0,
                "calls": [{"op": "place", "item_id": ok}],
                "item_ids": [ok, draft, unsafe, bogus],
            },
        )
        assert r.status_code == 200
        path, payload = stub_node["post"]
        assert path == "/api/studio-ops/apply"
        # Only the visible id reaches the engine, with its real image ref — hidden ids are dropped.
        assert payload["allowedCatalogIds"] == [str(ok)]
        assert payload["imageSrcById"] == {str(ok): "assets/ok.png"}
        for hidden in (draft, unsafe, bogus):
            assert str(hidden) not in payload["allowedCatalogIds"]
        assert payload["calls"] == [{"op": "place", "item_id": ok}]
        assert payload["sceneIndex"] == 0


def test_studio_ops_apply_omits_image_ref_when_no_cover(app, stub_node):
    # An approved item with no image → an allowed id but NO src (so `place` can't fabricate one).
    noimg = _seed(app, "No Image Tour", cover="")
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        c.post(
            "/ai-agent/studio/ops/apply",
            headers=agent,
            json={"design": _DESIGN, "calls": [], "item_ids": [noimg]},
        )
        _, payload = stub_node["post"]
        assert payload["allowedCatalogIds"] == [str(noimg)]
        assert payload["imageSrcById"] == {}


# ── Visual observe + critic loop wiring (AC102/AC103) ─────────────────────────────────────────────
import base64  # noqa: E402

import httpx  # noqa: E402

from app.ai import vision  # noqa: E402
from app.ai.studio_agent import StudioAgentResult  # noqa: E402
from app.ai.studio_graph import _BuilderSession  # noqa: E402

_PNG = b"\x89PNG-synthetic-frame"
_PNG_URL = "data:image/png;base64," + base64.b64encode(_PNG).decode()


@pytest.fixture
def visual_node(monkeypatch):
    """Node stub that also serves /render; records every post. No network, no browser."""
    seen: dict = {"posts": []}

    def fake_post(path, payload):
        seen["posts"].append((path, payload))
        if path.endswith("/render"):
            return {"pngs": [_PNG_URL], "width": 1080, "height": 1080, "broken_images": []}
        return {"design": payload["design"], "results": [], "valid": True}

    monkeypatch.setattr(studio_router, "_node_post", fake_post)
    monkeypatch.setattr(studio_router, "_node_get", lambda p: {"ops": []})
    return seen


def _fake_build_factory(record: dict):
    """Stands in for the Gemini graph: drives the REAL observe_visual through the injected fns."""

    def build(**kw):
        record.setdefault("builds", []).append(kw["prompt"])
        record["max_visual_observes"] = kw["max_visual_observes"]
        session = _BuilderSession(
            kw["design"], kw["scene_index"], kw["apply_fn"], kw["observe_fn"],
            kw["generate_image_fn"], kw.get("on_step"), render_fn=kw["render_fn"],
            critique_fn=kw["critique_fn"], max_visual_observes=kw["max_visual_observes"],
        )
        record.setdefault("visual", []).append(session.observe_visual())
        return StudioAgentResult(design=kw["design"], finished=True, provider="gemini")

    return build


def _use_gemini(settings):
    settings.ai_provider = "gemini"
    settings.gemini_api_key = "test-key-xxxx"  # obviously fake; the graph/vision are mocked


def test_agent_runs_observe_visual_and_critic_loop_grounded(
    app, settings, visual_node, monkeypatch
):
    _use_gemini(settings)
    ok = _seed(app, "Visible Tour", cover="assets/ok.png")
    hidden = _seed(app, "Draft Secret", approved=False)
    record: dict = {}
    monkeypatch.setattr(studio_router, "run_studio_graph", _fake_build_factory(record))
    # One blocking (fail -> P1) issue on the first look, clean afterwards -> exactly one fix round.
    calls = {"n": 0}

    def fake_critique(settings, pngs, checklist, mode, scene=None):
        calls["n"] += 1
        # The scene JSON (stable across envs) reaches the stub — not a PNG hash/bytes.
        assert isinstance(scene, dict) and scene.get("id") == "s1"
        assert list(pngs) == [_PNG]  # the data URL was decoded to bytes for the vision model
        issues = [{"category": "contrast", "severity": "fail", "note": "low contrast"}]
        return {"ok": False, "issues": issues if calls["n"] <= 2 else [], "summary": "s"}

    monkeypatch.setattr(studio_router, "critique_scene", fake_critique)
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        r = c.post(
            "/ai-agent/studio/agent",
            headers=agent,
            json={"design": _DESIGN, "prompt": "Promote", "item_ids": [ok, hidden]},
        )
    assert r.status_code == 200 and r.json()["provider"] == "gemini"
    # observe_visual ran live inside the build (render + vision), with the configured budget.
    assert record["max_visual_observes"] == studio_router.MAX_VISUAL_OBSERVES
    assert "critique" in record["visual"][0] and record["visual"][0]["mode"] == "image"
    # Critic loop: build, critique P1, fix build (prompt carries the finding), re-critique.
    assert len(record["builds"]) == 2 and "low contrast" in record["builds"][1]
    # Contract 1: every render request carried only the visible id + its real src.
    renders = [p for path, p in visual_node["posts"] if path == "/api/studio-ops/render"]
    assert len(renders) >= 3  # observe_visual x2 builds + critic rounds
    for payload in renders:
        assert payload["allowedCatalogIds"] == [str(ok)]
        assert payload["imageSrcById"] == {str(ok): "assets/ok.png"}
        assert str(hidden) not in payload["allowedCatalogIds"]


def test_agent_stub_path_is_deterministic_and_skips_render(app, visual_node):
    # No Gemini key: deterministic stub compose; nothing visual to review, so no browser render.
    ok = _seed(app, "Visible Tour")
    body = {"design": _DESIGN, "prompt": "Promote", "item_ids": [ok]}
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        a = c.post("/ai-agent/studio/agent", headers=agent, json=body)
        b = c.post("/ai-agent/studio/agent", headers=agent, json=body)
    assert a.status_code == 200 and a.json() == b.json()
    assert not any(p == "/api/studio-ops/render" for p, _ in visual_node["posts"])


def test_agent_render_engine_down_still_returns_the_built_design(app, settings, monkeypatch):
    # A render-engine failure must NEVER discard a successful build: observe_visual degrades to a
    # text fallback and the critic loop skips the review, so the built design still returns (200).
    _use_gemini(settings)
    monkeypatch.setattr(studio_router, "run_studio_graph", _fake_build_factory({}))
    ok = _seed(app, "Visible Tour")

    def fake_post(path, payload):
        if path.endswith("/render"):
            raise httpx.ConnectError("down")
        return {"design": payload["design"], "results": [], "valid": True}

    monkeypatch.setattr(studio_router, "_node_post", fake_post)
    monkeypatch.setattr(studio_router, "_node_get", lambda p: {"ops": []})
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        r = c.post(
            "/ai-agent/studio/agent",
            headers=agent,
            json={"design": _DESIGN, "prompt": "Promote", "item_ids": [ok]},
        )
    assert r.status_code == 200 and r.json()["provider"] == "gemini"


def test_critique_frames_keys_stub_on_scene_json_not_pixels(settings):
    # Contract 4 / AC102b: the no-key stub must be keyed on the SCENE JSON, never the rendered
    # pixels — headless-Chromium PNG bytes drift across Chromium builds/fonts/platforms, so a
    # pixel key would not be cross-environment reproducible.
    scene = {"id": "s0", "nodes": [{"id": "n"}]}
    checklist = [{"kind": "checklist", "items": ["contrast"]}]
    out = studio_router._critique_frames(settings, [_PNG], "image", checklist, scene)
    assert out["scene_hash"] == vision._scene_hash(scene)
    # Same scene + DIFFERENT pixels -> identical verdict (the stub ignores pixels).
    other_pixels = studio_router._critique_frames(
        settings, [_PNG + b"\x00"], "image", checklist, scene
    )
    assert other_pixels["scene_hash"] == out["scene_hash"] and other_pixels == out
    # Different scene -> a different stub key.
    other_scene = studio_router._critique_frames(settings, [_PNG], "image", checklist, {"id": "s1"})
    assert other_scene["scene_hash"] != out["scene_hash"]


def test_critique_frames_maps_issues_and_verifies_prior_findings(settings):
    # Stub vision (no key) is deterministic; severities map fail->P1, warn->P2, info->P3.
    scene = {"id": "s0", "nodes": []}
    out = studio_router._critique_frames(
        settings, [_PNG], "image",
        [{"kind": "checklist", "items": ["contrast"]}, "broken-node-id"], scene,
    )
    again = studio_router._critique_frames(
        settings, [_PNG], "image", [{"kind": "checklist", "items": ["contrast"]}], scene
    )
    assert out == again
    verify = {"kind": "verify", "findings": [{"id": "v-contrast"}, {"id": "gone"}]}
    res = studio_router._critique_frames(settings, [_PNG], "image", [verify], scene)
    status = {v["id"]: v["status"] for v in res["verifications"]}
    assert status["gone"] == "fixed"
    assert status["v-contrast"] == ("not" if any(f["id"] == "v-contrast" for f in res["findings"])
                                    else "fixed")


def test_data_url_bytes_decodes_and_tolerates_garbage():
    assert studio_router._data_url_bytes(_PNG_URL) == _PNG
    assert studio_router._data_url_bytes("data:image/png;base64,@@@") == b""


def test_generate_image_fn_persists_every_asset_under_concurrency(app, settings, monkeypatch):
    # Regression (.claude/rules/critical-patterns.md): in the /agent/stream path ONE sprite_session
    # is shared by every worker thread, and LangGraph's ToolNode runs a turn's generate_image calls
    # CONCURRENTLY. The Session read-modify-write must be serialised so no write is lost and the
    # Session is never corrupted — N parallel calls must yield N persisted, distinct-ref assets.
    from concurrent.futures import ThreadPoolExecutor
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from app.models.catalog import UserAsset
    from app.models.user import User

    monkeypatch.setattr(studio_router, "_node_get", lambda p: {"ops": []})
    # Deterministic fake image gen + storage — no provider, no MinIO (hermetic).
    monkeypatch.setattr(
        studio_router, "_generate_image",
        lambda s, concept: SimpleNamespace(data=b"not-a-real-png", content_type="image/png"),
    )
    puts: list[str] = []
    storage = SimpleNamespace(put_object=lambda key, data, ct: puts.append(key))

    SessionLocal = app.state.sessionmaker
    grounding_db = SessionLocal()
    sprite_session = SessionLocal()  # ONE session shared across worker threads — the exact hazard
    try:
        agent = grounding_db.query(User).filter_by(email="agent@test.local").one()
        runtime = studio_router._build_agent_runtime(
            agent, grounding_db, settings, storage, [], datetime.now(UTC),
            sprite_session=sprite_session,
        )
        gen = runtime["generate_image_fn"]
        n = 24
        with ThreadPoolExecutor(max_workers=12) as ex:
            handles = list(ex.map(lambda i: gen(f"concept {i}", {}), range(n)))
    finally:
        sprite_session.close()
        grounding_db.close()

    # Every parallel call returned a distinct ref and persisted its own asset — none lost/clobbered.
    assert len({h["ref"] for h in handles}) == n
    assert len(puts) == n
    with SessionLocal() as verify:
        assert verify.query(UserAsset).filter_by(owner_id=agent.id).count() == n


def test_generate_and_apply_are_safe_under_concurrency(app, settings, monkeypatch):
    # Regression (review MF1): apply_fn hands `generated_images` to _node_post, which json-
    # serialises the payload (iterating that dict). A concurrent generate_image inserting a ref
    # would raise "dictionary changed size during iteration" — the critical-patterns.md shared-state
    # hazard in the dict sibling of the DB lock. apply_fn must serialise a snapshot taken under the
    # shared lock. This fires generate ∥ apply in parallel and asserts no thread raises.
    import json as _json
    from concurrent.futures import ThreadPoolExecutor
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from app.models.user import User

    monkeypatch.setattr(studio_router, "_node_get", lambda p: {"ops": []})
    monkeypatch.setattr(
        studio_router, "_generate_image",
        lambda s, concept: SimpleNamespace(data=b"not-a-real-png", content_type="image/png"),
    )

    # The apply stub mimics the real _node_post: it json-serialises the payload (the exact step that
    # crashes if generatedImagesById mutates during iteration), then returns a minimal result.
    def fake_post(path, payload):
        _json.dumps(payload)
        return {"design": payload["design"], "results": [], "valid": True}

    monkeypatch.setattr(studio_router, "_node_post", fake_post)
    storage = SimpleNamespace(put_object=lambda key, data, ct: None)

    SessionLocal = app.state.sessionmaker
    grounding_db = SessionLocal()
    sprite_session = SessionLocal()  # ONE session shared across worker threads — the exact hazard
    try:
        agent = grounding_db.query(User).filter_by(email="agent@test.local").one()
        runtime = studio_router._build_agent_runtime(
            agent, grounding_db, settings, storage, [], datetime.now(UTC),
            sprite_session=sprite_session,
        )
        gen = runtime["generate_image_fn"]
        apply = runtime["apply_fn"]
        design = {"format": "social", "width": 1, "height": 1, "scenes": [{"id": "s", "nodes": []}]}

        def task(i: int):
            if i % 2 == 0:
                return gen(f"concept {i}", {})
            return apply(design, [], 0)

        with ThreadPoolExecutor(max_workers=12) as ex:
            results = list(ex.map(task, range(48)))
    finally:
        sprite_session.close()
        grounding_db.close()

    # No thread raised (a dict-changed-size-during-iteration would have surfaced here).
    assert len(results) == 48


def test_generate_image_fn_recovers_after_a_commit_failure(app, settings, monkeypatch):
    # Regression (review MF2 / testing HARD BLOCK exception coverage): a commit failure on the
    # shared worker Session must roll back under the lock, not poison every later generate_image
    # for the turn (PendingRollbackError cascade), since in /agent/stream `worker_db` is one shared
    # session. Force ONE commit to fail and assert a later op still persists.
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from app.models.catalog import UserAsset
    from app.models.user import User

    monkeypatch.setattr(studio_router, "_node_get", lambda p: {"ops": []})
    monkeypatch.setattr(
        studio_router, "_generate_image",
        lambda s, concept: SimpleNamespace(data=b"not-a-real-png", content_type="image/png"),
    )
    storage = SimpleNamespace(put_object=lambda key, data, ct: None)

    SessionLocal = app.state.sessionmaker
    grounding_db = SessionLocal()
    sprite_session = SessionLocal()
    try:
        agent = grounding_db.query(User).filter_by(email="agent@test.local").one()
        runtime = studio_router._build_agent_runtime(
            agent, grounding_db, settings, storage, [], datetime.now(UTC),
            sprite_session=sprite_session,
        )
        gen = runtime["generate_image_fn"]

        # Fail exactly the first commit, then fall through to the real one.
        real_commit = sprite_session.commit
        calls = {"n": 0}

        def flaky_commit():
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("induced commit failure")
            return real_commit()

        monkeypatch.setattr(sprite_session, "commit", flaky_commit)

        with pytest.raises(RuntimeError):
            gen("first", {})
        # The shared Session recovered (rolled back under the lock) — a later op still persists.
        handle = gen("second", {})
        assert handle["ref"].startswith("gen:")
    finally:
        sprite_session.close()
        grounding_db.close()

    # Only the second asset persisted; the failed first was rolled back (not left pending).
    with SessionLocal() as verify:
        assert verify.query(UserAsset).filter_by(owner_id=agent.id).count() == 1


def test_apply_payload_is_a_stable_snapshot_while_generate_inserts(app, settings, monkeypatch):
    # Deterministic MF1 regression (no timing luck): pause apply's payload mid-iteration, insert a
    # new generated ref from another thread, then resume. A live `generated_images` dict raises
    # "dictionary changed size during iteration"; the under-lock snapshot must not.
    import threading
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from app.models.user import User

    monkeypatch.setattr(studio_router, "_node_get", lambda p: {"ops": []})
    monkeypatch.setattr(
        studio_router, "_generate_image",
        lambda s, concept: SimpleNamespace(data=b"not-a-real-png", content_type="image/png"),
    )
    seen: dict[str, list[str]] = {}

    def fake_post(path, payload):
        it = iter(payload["generatedImagesById"])
        first = next(it)
        t = threading.Thread(target=lambda: gen("second", {}))
        t.start()
        t.join()
        seen["keys"] = [first, *it]  # RuntimeError here if the dict was live
        return {"design": payload["design"], "results": [], "valid": True}

    monkeypatch.setattr(studio_router, "_node_post", fake_post)
    storage = SimpleNamespace(put_object=lambda key, data, ct: None)

    SessionLocal = app.state.sessionmaker
    grounding_db = SessionLocal()
    sprite_session = SessionLocal()
    try:
        agent = grounding_db.query(User).filter_by(email="agent@test.local").one()
        runtime = studio_router._build_agent_runtime(
            agent, grounding_db, settings, storage, [], datetime.now(UTC),
            sprite_session=sprite_session,
        )
        gen = runtime["generate_image_fn"]
        gen("first", {})
        design = {"format": "social", "width": 1, "height": 1, "scenes": [{"id": "s", "nodes": []}]}
        runtime["apply_fn"](design, [], 0)
    finally:
        sprite_session.close()
        grounding_db.close()

    assert len(seen["keys"]) == 1  # the snapshot predates the concurrent insert


def test_agent_start_builds_into_a_draft_the_client_polls(app, settings, monkeypatch):
    # The build runs in the background and writes a DRAFT the browser polls (no SSE to drop). Start
    # returns a build_id == <project>:<run_code>; the draft fills in and finishes; applies land.
    import time as _t

    def fake_run_build(_settings, _runtime, body, **extra):
        node = {"id": "text-node-0", "type": "text"}
        built = {**body.design, "scenes": [{"id": "s0", "nodes": [node]}]}
        on_step = extra.get("on_step")
        if on_step:
            on_step({"action": "apply", "note": "Placing…", "design": built})
        return StudioAgentResult(design=built, applied=1, finished=True, provider="gemini")

    monkeypatch.setattr(studio_router, "_run_build", fake_run_build)
    monkeypatch.setattr(studio_router, "_node_get", lambda p: {"ops": []})
    ok = _seed(app, "Visible Tour")
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        start = c.post("/ai-agent/studio/agent/start", headers=agent, json={
            "design": _DESIGN, "prompt": "Promote", "item_ids": [ok],
            "project_id": "proj7", "run_code": "abc123",
        })
        assert start.status_code == 200
        bid = start.json()["build_id"]
        assert bid == "proj7:abc123"  # one build == one <project>:<run-code> thread

        draft = None
        for _ in range(100):
            r = c.get(f"/ai-agent/studio/agent/draft/{bid}", headers=agent)
            assert r.status_code == 200
            draft = r.json()
            if draft["finished"]:
                break
            _t.sleep(0.02)
        assert draft and draft["finished"] and draft["status"] == "done"
        assert draft["applied"] == 1
        assert draft["design"]["scenes"][0]["nodes"][0]["id"] == "text-node-0"

        # cancel is idempotent + owner-scoped; a 2nd agent can't read/cancel this build.
        assert c.post(f"/ai-agent/studio/agent/cancel/{bid}", headers=agent).status_code == 200
        other = auth_header(c, Role.super_admin)
        assert c.get(f"/ai-agent/studio/agent/draft/{bid}", headers=other).status_code in (403, 404)

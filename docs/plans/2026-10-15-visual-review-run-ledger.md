# Run ledger — Visual scene observation + critic/reviewer loop (AC102–AC103)

Durable state + **checkpoint log** for a `/oneshot-poc:run`. Every node reads this first and updates
it when done, so an interrupted run resumes from the last checkpoint. Content-free: status + decisions
only, never secrets/PII.

- **Charter:** `REQUIREMENTS.md` (AC102–AC103, v2.66.0)  ·  **Branch:** `feat/studio-agent-harness`
  (dedicated commits held pending user approval per standing constraint)

## Checkpoint (resume reads this FIRST)

```
status:          P3 DONE + INTEGRATED — AC102a end-to-end FIXED (render route reachable + non-mocked smoke passes); all gates green; committed local
active_phase:    P3 (AC102a reachable-render-route fix) — DONE
next_node:       —  (P1+P2+P3 complete; AC102/AC103 all met end-to-end; awaiting ⏸ user verify gate)
last_completed:  P3 INTEGRATE+COMMIT — renamed route `_render`→`render`, added non-mocked e2e smoke, manifest row; make verify green; committed local
workflow_run_id: wf_4c628f9e-120   # P1 build-loop (same-session resume via resumeFromRunId)
updated:         2026-10-15 (P3 integrated: AC102a now proven end-to-end against the REAL route by a non-mocked Playwright smoke)
note:            `make verify` is GREEN end-to-end (lint · api 497p/2-skip · api-types-sync · web tsc · web unit ·
                 e2e 45/45 · matrix 103 met/0 partial/0 missing [AC102 19/19, AC103 6/6] · sync 103 · compose). The
                 QA-found AC102a private-folder 404 is resolved: `app/studio/_render` → `app/studio/render` (plain
                 routable segment), `RENDER_PAGE_PATH="/studio/render"`, and the new NON-mocked
                 `e2e/studio-render-smoke.spec.ts` loads the real page under `next start`, asserts route 200 +
                 `__studioRenderReady` + a valid non-blank PNG — the gap the 7 mocked vitest proofs masked is now
                 covered. Committed to `feat/studio-agent-harness` (local only, no push).
```

## Phase plan (ordered, shippable slices)

| Phase | Title | Requirements (charter #s) | Status |
|-------|-------|---------------------------|--------|
| P1 | Server-side render path + `observe_visual` (image + video) | AC102 | done (gates green) |
| P2 | Independent critic + bounded fix loop | AC103 | done (gates green) |
| P3 | Fix AC102a end-to-end: make the render route reachable + a non-mocked render smoke | AC102a | done (gates green; non-mocked smoke passes) |

## Requirement status (acceptance checklist across all phases)

| # | Requirement | Phase | Status | Evidence / note |
|---|-------------|-------|--------|-----------------|
| AC102a | Node `/api/studio-ops/render` renders a scene to PNG(s) at given times via headless Chromium reusing `frames.ts` | P1→P3 | met (end-to-end) | `app/api/studio-ops/render/route.ts` + `lib/studio/render-browser.ts` (lazy singleton + hard timeout + relaunch + egress interception) driving `app/studio/render/page.tsx` (P3: renamed from the Next private folder `_render`, so the route is reachable; `RENDER_PAGE_PATH="/studio/render"`); `frames.ts` → shared `sampleTimesForScene`; `playwright` dep installed. Proofs: `studio-render.test.ts` (mocked unit) **+ `e2e/studio-render-smoke.spec.ts` (NON-mocked: real route 200 + `__studioRenderReady` + valid non-blank PNG under `next start`)** — closes the mocked-boundary gap QA found |
| AC102b | FastAPI can fetch a server render + run a Gemini vision critique (key never logged); no-key deterministic stub | P1 | met | `app/ai/vision.py` (`critique_scene` + stub hashed on scene JSON), `ai_vision_provider`/`ai_vision_model` config; key referenced only, never logged (Contract 2). Proof: `test_vision.py` |
| AC102c | `observe_visual` tool — image mode (still → layout/contrast/clipping/legibility/broken-image critique) | P1 | met | `_BuilderSession.observe_visual` + tool registration beside `observe` in `studio_graph.py`. Proof: `test_studio_graph.py::test_observe_visual_*`, `test_studio.py` router tests |
| AC102d | `observe_visual` video mode (timeline + transition-boundary contact sheet → motion-continuity critique), animated scenes only | P1 | met | `_scene_is_animated` → auto video mode; `no_animation` fallback. Proof: `test_studio_graph.py::test_scene_is_animated_*`, `test_observe_visual_no_animation_fallback_*` |
| AC102e | Render/vision budgeted (small cap) + run outside the session lock; text `observe` stays default | P1 | met | budget counted under lock, render+vision outside lock; typed failure codes → actionable strings. Proof: `test_studio_graph.py::test_observe_visual_budget_cap`, `test_observe_visual_runs_render_outside_the_lock` |
| AC103a | Independent critic: image(s) + fixed checklist only → structured P1/P2/P3 {scene, region, smallest fix} | P2 | met | `app/ai/studio_critic.py`; critic sees only images + checklist. Proof: `test_studio_critic.py::test_critic_is_independent_of_build_history` |
| AC103b | Bounded fix loop in `run_studio_graph`: build → critique → fix P1s → re-render → re-review, ≤2 rounds | P2 | met | `MAX_ROUNDS=2`, only P1 drives fixes. Proof: `test_studio_critic.py::test_only_p1_drive_fixes_and_loop_bounded_to_two_rounds` |
| AC103c | From round 2 the critic re-verifies each prior finding (fixed / partly / not) | P2 | met | Proof: `test_studio_critic.py::test_round_two_verifies_each_prior_finding` |
| AC103d | Deterministic + hermetic tests (render + vision boundaries mocked) | P2 | met | Proof: `test_studio_critic.py::test_deterministic_same_inputs_same_decisions`, boundaries mocked throughout |

## Chosen approach (P1 — locked at BRAINSTORM→PLAN)

**Base: Approach 1 (MVP-first)** — smallest chain that meets AC102, best scope- and stage-fit
(PoC, YAGNI). `/api/studio-ops/render` reuses `frames.ts` (true WYSIWYG); `observe_visual` added
*beside* `observe` (stays default); per-run render/vision budget copying the `generate_image`
pattern; stub critic keyed on scene-JSON hash; Contract-1 src allowlist before Chromium launches.
Tests assert **structural** PNG properties (non-blank, dimensions), never exact pixels.

**Grafted in (the strongest ideas from Approaches 2 & 3):**
- *From A3* — **typed failure codes** (`timeout | browser_crash | bad_workspace | budget_exhausted
  | no_animation`) that `observe_visual` maps to short actionable strings, so the Builder falls back
  to text `observe` instead of looping. Cheap; kills the agent-loop/hang failure mode.
- *From A3* — **broken images are a reported fact** (`broken_images: [nodeId]`), not a render error;
  passed to the critic as ground truth.
- *From A3* — **Chromium request interception** blocking all non-allowlisted egress (defence-in-depth
  for Contract 2, on top of the src allowlist).
- *From A3* — **hard per-request timeout + relaunch-on-crash** promoted into the MVP (A1 itself flagged
  a missed `__ready` hang as its main risk; this is not optional). Lazy **singleton browser** per
  Next.js process kept as a few-line win for the repeated demo calls.
- *From A2* — a proper **readiness gate** before capture: `document.fonts.ready` + explicit per-font
  load + image decode/settle + the `studio-video-in-fabric-capture` memory handling
  (`element.width=videoWidth`, `objectCaching:false`, seek via rVFC + timeout fallback); **fixed
  viewport / deviceScaleFactor / locale / timezone**; animation clock **seeked**, not free-running.
  These are needed just to get non-blank, stable-enough frames — not gold-plating.

**Deferred (YAGNI for a single-user PoC; revisit only if it bites):**
- A2's **byte-identical / golden-hash determinism gate** and cross-machine (macOS↔Docker) pixel work.
  Contract-4 determinism is satisfied where it actually lives — the **stub critic keyed on scene JSON**
  — not in pixel output. (Memory `studio-svg-animation-rasterization` + the macOS/Linux font-drift
  risk make a pixel gate a known rabbit hole.)
- A3's **`/render/health`, `render_ms` metrics, semaphore load-shedding (`busy`), sidecar browser**.
  No concurrent-demo need; premature.

**Trade-off & why:** MVP-first trades built-in robustness/operability (golden-hash determinism, health
+ metrics, load shedding) for speed and exact P1 scope-fit. We accept pixel non-determinism and thin
observability as the cost, and buy down the two highest-impact risks *cheaply* by grafting the
readiness gate (non-blank renders), the hard timeout + crash recovery (no hangs), typed failure codes
(no agent loops), and egress interception (Contract 2). Approaches 2 and 3 front-load effort (3–4 d)
against risks that are either deferrable (pixel determinism — tests don't depend on pixels) or
not-yet-real (concurrency/operability for a demo). Net: ~2–3 days, every AC102a–e clause covered,
Contracts 1/2/4 built in, AC103 left unblocked.

**Sourcing:** the rendering-determinism/font-readiness claims rest on the secondary sources the
candidates already web-searched (createit.com WebGL-in-Playwright; technetexperts headless distortion;
htmlcsstoimage wait-before-screenshot; qaskills font-flake — all accessed 2026-10-15; no Fabric-specific
primary source found). The scope/contract reasoning cites this repo: `REQUIREMENTS.md` AC102–AC103,
`CLAUDE.md` Contracts 1/2/4, `.claude/rules/critical-patterns.md` (lock serialisation), and memory
`studio-video-in-fabric-capture` / `studio-svg-animation-rasterization`. The specific graft/defer
synthesis is **No source found — this is an AI-generated idea.**

## Iteration log

| When (phase · node) | What changed | Result |
|---------------------|--------------|--------|
| — · A2 | scope QA answered; charter AC102–AC103 written to REQUIREMENTS.md v2.66.0 | confirmed |
| — · A3 | split into P1 (render + observe_visual) and P2 (critic loop) | ledger created |
| P1 · PLAN (manager select) | Chose Approach 1 (MVP-first) as base; grafted typed-error codes + broken-image facts + egress interception + hard-timeout/crash-recovery + singleton browser (A3) and the readiness gate + fixed-viewport/seeked-clock capture (A2); deferred golden-hash pixel determinism and health/metrics/load-shedding | approach locked; AC102a–e still `todo` (build pending) |
| P1 · PLAN (manager detail) | Turned the locked approach into a concrete file/function/test plan for AC102a–e: Comp.A (web render path — new render route + render-browser singleton + headless `_render` page + `frames.ts` refactor + `playwright` dep), Comp.B (api `vision.py` critique seam + `ai_vision_*` config), Comp.C (`observe_visual` session method + tool, budget-outside-lock, auto image/video, typed failure codes). Parallel: A ∥ B on disjoint trees; C's `studio_graph.py` + tests run against fixed injected `render_fn`/`critique_fn` signatures in parallel; the `studio.py` real wiring is the serial integration step after A+B. One test per clause (vitest for A; pytest for B/C), all boundaries (chromium + Gemini) mocked, synthetic fixtures, pixel-determinism deferred — structural PNG asserts only | AC102a–e `planned`; ready for BUILD |
| P1+P2 · INTEGRATE (manager) | Integrated the P1 (render + `observe_visual` + `vision.py`) and P2 (`studio_critic.py` loop) work into a coherent whole against REQUIREMENTS.md and ran the full `make verify`. Fixes to reach green: (1) installed the `playwright` dep into `apps/web` (lockfile +3) so `render-browser.ts` resolves (web tsc); (2) ruff line-wrap on 13 E501 + 1 I001 (new `studio_critic.py`/`vision.py` tests + pre-existing `seed_demo.py`/`test_builder.py`/`test_creative_plan.py`/`test_observability.py`); (3) added **AC102 + AC103** proof rows to `requirements.manifest.yaml` (sync guard required them — now 103 in sync); (4) fixed a **pre-existing** e2e break — `creative-plan-smoke.spec.ts` still drove the retired Creative-Plan-IR UI (removed by commit `09d9d5a` Planner→Builder); rewrote it for the shipped `ContentPlanPanel` ("catalog item available" → Planner brief → Generate plan → editable plan grounded on "Harbour Festival"), preserving the AC41/AC42 grounding proof | **All gates PASS (exit 0):** lint · api 495p/2-skip · api-types-sync · web tsc · web 275p · e2e 44/44 · matrix **103 met · 0 partial · 0 missing** (AC102 18/18, AC103 6/6) · sync · compose. Committed locally (no push). |
| P1 · REVIEW triage (manager) | Re-evaluated all 15 review findings against the P1/AC102 bar (correct · safe · explainable · reproducible). **mustFix (2), both AC102, both code-diverged-from-the-locked-plan:** (a) `render-browser.ts:203` — the timeout branch `.close()`s the **shared** singleton browser, clobbering any concurrent `renderStills` context (reachable: LangGraph `ToolNode` runs a turn's `observe_visual` calls in parallel — the exact `critical-patterns.md` concurrency hazard) → spurious `browser_crash`; (b) `vision.py` no-key stub is keyed on **PNG-byte hashes** (`studio.py:105` passes `scene=key`), not the scene JSON its own docstring + the locked plan + the manifest all promise → breaks the Contract-4 cross-env reproducibility of the deterministic stub. **Deferred (13):** P3 polish (param/alias/doc renames, DRY on the budget-cap constant, test-quality hardening) + out-of-phase P2/AC103 items (`studio_critic.py`, `test_studio_critic.py`) + the studio-ops auth/DoS + `RENDER_ORIGIN` pinning (real but out of the single-user localhost PoC threat model — no Contract-1/2 breach; revisit before any networked deploy). **Route: fix** — both mustFixes are local edits that realign code with the already-approved design (don't close the shared browser on timeout, only on genuine disconnect/crash; thread the scene JSON to `_critique_frames` so the stub keys on it), then re-review. Plan + approach are sound → not replan/rebrainstorm. | triage complete; 2 mustFix → `/oneshot-poc:implement` (fix) → re-review |
| P1 · REVIEW triage (12-finding set) | Re-evaluated the later 12-finding review set against the AC102 bar (correct · safe · explainable · reproducible). **mustFix (1):** `studio.py:418` / `studio_graph.py:319` — `generate_image_fn` does `worker_db.add/commit/refresh` OUTSIDE the session lock, and in the stream path `worker_db` is ONE `sprite_session` shared across all worker threads; `ToolNode` runs a turn's tool calls concurrently, so parallel `generate_image` calls hit the same (non-thread-safe) SQLAlchemy Session — the exact `critical-patterns.md` incident pattern reintroduced in the DB layer (data-corruption / non-reproducible run → always-mustFix regardless of phase; Contract 4). Entangled with the AC102 loop's own "outside-the-lock" concurrency reasoning. **Deferred (11):** AC102 P3 polish (`observe_visual` unreachable typed-failure taxonomy @282 — no behavioral bug, recovery identical; `image` bool flag name @247; `sprite_session`→`worker_session` rename @334); scripted `builder-demo.ts` scope/duplication note (intentional POC-pitch demo); out-of-phase AC103 items (`studio.py:111` half-wired critic finding-contract, `:455` triplicated Gemini gate); out-of-phase sprite/panel test-coverage (`test_sprite_gen.py:66` lower-clamp boundary, `content-plan-panel.test.tsx:9` static-only panel wiring); and the unauthenticated Node studio-ops routes cluster (`render/route.ts:68` render-farm DoS + conditional SSRF-if-operator-allowlists-internal-origin; `middleware.ts:14` matcher gap + misleading comment — DEDUPED into one cluster) — real but no Contract-1/2 breach in the single-user localhost PoC threat model; revisit before any networked deploy. **Route: fix** — the one mustFix is a local edit (serialise add/commit behind a dedicated DB lock, or open a short-lived Session per `generate_image`), slow gen stays outside; approach/plan sound (AC102a–e met) → not replan/rebrainstorm. Needs a ThreadPoolExecutor regression test per `critical-patterns.md`. | triage complete; 1 mustFix → fix → re-review; 11 deferred |
| P1 · FIX + RE-REVIEW (manager) | Resolved both triaged mustFixes: (a) `render-browser.ts` timeout branch no longer closes the shared singleton browser (only genuine disconnect/crash relaunches), with a regression test in `studio-render.test.ts`; (b) the no-key vision stub is keyed on the scene JSON (threaded through `studio.py` to `_critique_frames`), with updated tests in `test_studio.py`/`test_studio_graph.py`. Re-review of the fixes: no remaining blockers. 13 deferred findings unchanged (P3 polish, P2/AC103 items, networked-deploy hardening). | **`make verify` PASS (all gates)** · matrix 103 met · 0 partial · 0 missing · sync 103 · compose OK. Checkpoint flipped; awaiting ⏸ user verify gate; commit held. |
| P1 · FIX (DB-concurrency mustFix) | Resolved the triaged P1 (`studio.py` `generate_image_fn` did `worker_db.add/commit/refresh` unserialised, and in `/agent/stream` `worker_db` is ONE `sprite_session` shared by every ToolNode worker thread → the `critical-patterns.md` shared-state-under-concurrency incident, in the DB layer). Fix: added a per-runtime `worker_db_lock` in `_build_agent_runtime` and serialised ONLY the Session read-modify-write (`add`/`commit`/`refresh` + the `asset.id` read) behind it; the slow image gen + storage put stay OUTSIDE the lock. Added a ThreadPoolExecutor regression test (`test_studio.py::test_generate_image_fn_persists_every_asset_under_concurrency`) firing 24 parallel `generate_image_fn` calls against a shared session and asserting all 24 persist with distinct refs — verified it FAILS without the lock (`ResourceClosedError` / flush-stage `add`) and PASSES with it. 11 deferred findings untouched. | **`make verify` PASS (all gates, exit 0):** lint · api **497p/2-skip** · api-types-sync · web tsc · web 276p · e2e 44/44 · matrix **103 met · 0 partial · 0 missing** · sync 103 · compose OK. (Standalone in-dir `pytest` shows a pre-existing env-leak flake in `test_sprite_gen` when a real `apps/api/.env` gemini key is present — unrelated to this change; the hermetic gate is green.) |
| P3 · PLAN (manager) | Turned the QA's AC102a defect into a concrete fix plan (no code changed this node). **Root cause confirmed in-repo:** `app/studio/_render` is a Next.js **private folder** (`_`-prefixed → opted out of routing), so `RENDER_PAGE_PATH="/studio/%5Frender"` 404s; Chromium `goto` never sees `__studioRenderReady`, `renderStills` hits the 30s hard timeout, and `POST /api/studio-ops/render`→`{"error":"timeout"}` 504. Every one of the 7 web render proofs in `studio-render.test.ts` mocks the browser via `__setBrowserLauncherForTests`, so none load the real page — the gap is invisible to the hermetic gate. **Plan (3 disjoint tasks, author in parallel):** **R1** rename `app/studio/_render` → `app/studio/render` (plain routable segment; middleware matcher @`middleware.ts:14` does **not** cover `/studio/*`, so it stays unauthenticated-reachable as Chromium needs and unlinked from nav) + set `RENDER_PAGE_PATH="/studio/render"` @`render-browser.ts:39` + fix the two stale `%5Frender` comments (`render-browser.ts:2`, `page.tsx:7`); **R2** add the missing **non-mocked** proof `apps/web/e2e/studio-render-smoke.spec.ts` (loads the real page under `next start`, asserts route 200, `window.__studioRenderReady===true`, and a non-blank PNG from `__studioRender(job)`); **R3** add R2's node-id to `requirements.manifest.yaml` under AC102 web. Chose the plain rename over the task's `%5Frender` option: the `%5F` escape makes the on-disk folder literally `%5Frender` and the URL segment `_render` (so `RENDER_PAGE_PATH` would then need to be `/studio/_render`, not `%5Frender`) — Next-version-fragile double-encoding that already bit us once; a plain segment is the least-surprising self-documenting fix. R1 doesn't break the mocked vitest (it never asserts the constant's literal and fakes `page.goto`). **No source found — this is an AI-generated idea** for the synthesis; the private-folder behavior is Next.js App Router routing semantics (official docs: `_`-prefixed = private folder, excluded from routing; `%5F` to opt a leading underscore back into the URL). | AC102a `partial`→plan recorded; ready for BUILD (P3) |
| P3 · INTEGRATE + COMMIT (manager) | Integrated the P3 AC102a fix (the QA-found private-folder 404) into a coherent whole against REQUIREMENTS.md and re-ran the full gate suite fresh — **green on attempt 1, no auto-fix needed.** Changes integrated: **R1** route `app/studio/_render/page.tsx` → `app/studio/render/page.tsx` (plain routable segment; middleware matcher @`middleware.ts:14` still does not cover `/studio/*`, so it stays unauthenticated-reachable for Chromium and unlinked from nav) + `RENDER_PAGE_PATH="/studio/%5Frender"`→`"/studio/render"` @`render-browser.ts:39` + the two stale `%5Frender`/`_render` comments corrected; **R2** new NON-mocked proof `apps/web/e2e/studio-render-smoke.spec.ts` (loads the real page under `next start`, asserts route 200, `window.__studioRenderReady===true`, PNG signature + IHDR dims match + >2 distinct decoded colours = non-blank; synthetic fixture); **R3** that node-id added to `requirements.manifest.yaml` under AC102 `e2e`. Also carried in the working tree: the DB-concurrency mustFix in `studio.py` (`worker_db_lock` serialising the shared-Session read-modify-write; `generate_image` + storage put stay outside) with its ThreadPoolExecutor regression `test_studio.py::test_generate_image_fn_persists_every_asset_under_concurrency`. Verified the new e2e #37 passes first attempt against the real route (no retry). Committed the working tree to the local feature branch (no push). | **`make verify` PASS (all gates, exit 0):** lint · api **497p/2-skip** · api-types-sync · web tsc · web unit · e2e **45/45** (new `studio-render-smoke` included) · matrix **103 met · 0 partial · 0 missing** (AC102 **19/19**, AC103 6/6) · sync 103 · compose OK. Committed to `feat/studio-agent-harness` (local only, no push). |
| P1+P2 · INTEGRATE + COMMIT (manager) | User invoked `/oneshot-poc:run` ("lets do 1,2"). Integrated the full P1+P2 working tree (the two mustFix edits across `render-browser.ts`/`studio-render.test.ts` and `studio.py`/`vision` stub threading + `test_studio.py`/`test_studio_graph.py`, plus `studio_agent.py`/`studio_critic.py`/`studio_graph.py`/`test_studio_critic.py`) against REQUIREMENTS.md and re-ran the full gate suite fresh (no auto-fix attempts needed — green on attempt 1). Committed the working tree to the local feature branch per the `/oneshot-poc:run` local-commit allowance (no push). | **`make verify` PASS (all gates, exit 0):** lint · api **496p/2-skip** · api-types-sync · web tsc · web **276p** · e2e **44/44** · matrix **103 met · 0 partial · 0 missing** (AC102 18/18, AC103 6/6) · sync 103 · compose OK. Committed to `feat/studio-agent-harness` (local only, no push). |

## Open assumptions / deferrals
- Commits are **held** until a ⏸ gate / explicit user approval (standing constraint overrides the loop's auto-commit).
- No new Studio UI (agent-only auto-loop) — the UI design pass is skipped (charter: no visual surface added).
- Video-mode critique runs only for scenes that have animation/transitions (cost control).

## Blockers (if stuck)
- (none)

## QA re-verification (P1 / AC102) — 2026-10-15

**Phase:** P1 (Server-side render path + `observe_visual`) · **Iteration:** independent QA acceptance pass.

**Requirement-status update (corrects the matrix above):**

| # | Requirement | Phase | Status | Evidence / note |
|---|-------------|-------|--------|-----------------|
| AC102a | `/api/studio-ops/render` renders a scene to PNG(s) via headless Chromium reusing `frames.ts` | P1 | **partial** | End-to-end BROKEN against a running app. Render page lives at `apps/web/app/studio/_render/page.tsx`; `_render` is a Next.js **private folder (excluded from routing)**, so `RENDER_PAGE_PATH="/studio/%5Frender"` (decodes to `/studio/_render`) returns **404**. Verified on a fresh `next dev`: `/login`,`/register`→200 but `/studio/%5Frender`,`/studio/_render`→404; live `POST /api/studio-ops/render` (valid design)→`{"error":"timeout"}` HTTP 504; Playwright `goto` status 404, `__studioRenderReady` never set, `window.__studioRender is not a function`. Fix: rename folder to `%5Frender` (or a non-underscore name + update `RENDER_PAGE_PATH`). All 18 web render tests pass but mock the browser via `__setBrowserLauncherForTests`, so none load the real page and none caught this. |
| AC102b | FastAPI vision critique + no-key stub; key never logged | P1 | met | `test_vision.py` 8/8 pass (`test_key_never_in_logs_or_output`, `test_provider_failure_degrades_to_stub`, `test_stub_deterministic_*`). Note: the "fetch a server render" half depends on AC102a, which is broken; the critique seam itself is sound. |
| AC102c | `observe_visual` image mode | P1 | met (unit) | `test_studio_graph.py::test_observe_visual_selects_image_vs_video_mode` + tool registration; real critique never fires in a running system because AC102a render times out (graceful fallback to text `observe`). |
| AC102d | `observe_visual` video mode + animated-scene detection | P1 | met (unit) | `test_scene_is_animated_detects_motion_and_transitions`, `test_observe_visual_no_animation_fallback_for_explicit_video`. |
| AC102e | Budgeted, render/vision outside the lock, text `observe` stays default | P1 | met | `test_observe_visual_budget_cap`, `test_observe_visual_runs_render_outside_the_lock`, `test_observe_visual_tool_registered_alongside_observe`. |

**What changed:** no code edited; QA found a real end-to-end defect in AC102a (private-folder route) that every hermetic test masks by mocking the browser/render boundary. **Verdict: GAPS REMAIN** — AC102a partial; loop should rename `app/studio/_render` → `app/studio/%5Frender` and add a non-mocked smoke that loads the real render page and asserts `__studioRenderReady`.

> **RESOLVED (P3, 2026-10-15):** fixed via the plain-segment rename `app/studio/_render` → `app/studio/render` (chosen over `%5Frender` double-encoding — see the P3 PLAN row) + `RENDER_PAGE_PATH="/studio/render"`, and the non-mocked proof `e2e/studio-render-smoke.spec.ts` now loads the real route under `next start` and asserts 200 + `__studioRenderReady` + a valid non-blank PNG. **AC102a is now `met` end-to-end** (e2e 45/45, matrix AC102 19/19). Committed local.

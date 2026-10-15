# Run ledger — Visual scene observation + critic/reviewer loop (AC102–AC103)

Durable state + **checkpoint log** for a `/oneshot-poc:run`. Every node reads this first and updates
it when done, so an interrupted run resumes from the last checkpoint. Content-free: status + decisions
only, never secrets/PII.

- **Charter:** `REQUIREMENTS.md` (AC102–AC103, v2.66.0)  ·  **Branch:** `feat/studio-agent-harness`
  (dedicated commits held pending user approval per standing constraint)

## Checkpoint (resume reads this FIRST)

```
status:          gates_green + committed locally (awaiting ⏸ user verify gate)
active_phase:    P1+P2 integrated
next_node:       ⏸ VERIFY (human product gate) → COMPOUND
last_completed:  Manager integration re-run: full `make verify` PASS (all gates) on the working tree; committed locally (no push)
workflow_run_id: wf_4c628f9e-120   # P1 build-loop (same-session resume via resumeFromRunId)
updated:         2026-10-15 (manager integrate+commit; make verify green; matrix 103/0/0)
note:            Full `make verify` re-run green on the working tree: api 496p/2-skip, web 276p, e2e 44/44
                 (the 2 mustFix regression tests lift api 495→496 / web 275→276) · matrix 103 met/0 partial/0 missing (AC102 18/18, AC103 6/6) · sync 103 · compose OK. Committed to feat/studio-agent-harness (local only).
```

## Phase plan (ordered, shippable slices)

| Phase | Title | Requirements (charter #s) | Status |
|-------|-------|---------------------------|--------|
| P1 | Server-side render path + `observe_visual` (image + video) | AC102 | done (gates green) |
| P2 | Independent critic + bounded fix loop | AC103 | done (gates green) |

## Requirement status (acceptance checklist across all phases)

| # | Requirement | Phase | Status | Evidence / note |
|---|-------------|-------|--------|-----------------|
| AC102a | Node `/api/studio-ops/render` renders a scene to PNG(s) at given times via headless Chromium reusing `frames.ts` | P1 | met | `app/api/studio-ops/render/route.ts` + `lib/studio/render-browser.ts` (lazy singleton + hard timeout + relaunch + egress interception) driving `app/studio/_render/page.tsx`; `frames.ts` → shared `sampleTimesForScene`; `playwright` dep installed. Proof: `studio-render.test.ts` |
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
| P1 · FIX + RE-REVIEW (manager) | Resolved both triaged mustFixes: (a) `render-browser.ts` timeout branch no longer closes the shared singleton browser (only genuine disconnect/crash relaunches), with a regression test in `studio-render.test.ts`; (b) the no-key vision stub is keyed on the scene JSON (threaded through `studio.py` to `_critique_frames`), with updated tests in `test_studio.py`/`test_studio_graph.py`. Re-review of the fixes: no remaining blockers. 13 deferred findings unchanged (P3 polish, P2/AC103 items, networked-deploy hardening). | **`make verify` PASS (all gates)** · matrix 103 met · 0 partial · 0 missing · sync 103 · compose OK. Checkpoint flipped; awaiting ⏸ user verify gate; commit held. |
| P1+P2 · INTEGRATE + COMMIT (manager) | User invoked `/oneshot-poc:run` ("lets do 1,2"). Integrated the full P1+P2 working tree (the two mustFix edits across `render-browser.ts`/`studio-render.test.ts` and `studio.py`/`vision` stub threading + `test_studio.py`/`test_studio_graph.py`, plus `studio_agent.py`/`studio_critic.py`/`studio_graph.py`/`test_studio_critic.py`) against REQUIREMENTS.md and re-ran the full gate suite fresh (no auto-fix attempts needed — green on attempt 1). Committed the working tree to the local feature branch per the `/oneshot-poc:run` local-commit allowance (no push). | **`make verify` PASS (all gates, exit 0):** lint · api **496p/2-skip** · api-types-sync · web tsc · web **276p** · e2e **44/44** · matrix **103 met · 0 partial · 0 missing** (AC102 18/18, AC103 6/6) · sync 103 · compose OK. Committed to `feat/studio-agent-harness` (local only, no push). |

## Open assumptions / deferrals
- Commits are **held** until a ⏸ gate / explicit user approval (standing constraint overrides the loop's auto-commit).
- No new Studio UI (agent-only auto-loop) — the UI design pass is skipped (charter: no visual surface added).
- Video-mode critique runs only for scenes that have animation/transitions (cost control).

## Blockers (if stuck)
- (none)

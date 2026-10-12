# R&D — Agentic Design Studio harness (reference study + proposal)

**Date:** 2026-10-12 · **Branch:** `feat/studio-agent-harness` (off `dev`)
**Reference studied:** `nextwork-projects/ai-video-editor` (NextWork "AI Video Editor"), a Claude Code plugin for agentic video editing. Cloned + analysed in depth (harness wiring · editing engine/contracts · orchestration/evals).

## 1. What the reference actually is (one paragraph)

A **file-based data pipeline driven by Claude Code**, not an app with a live model in memory. Capability = **Agent Skills** (one `start` orchestrator + one skill per phase). "Tools" = **plain Python/JS scripts the model runs via Bash**, contracted by `SKILL.md` (exact command + args; **exit codes + one-line stderr are the API**; **JSON files in a per-project folder are the interchange**). A local **stdlib HTTP server on 127.0.0.1** serves the editor UI and bridges to Claude through a **file-backed job queue** (`home.py wait` blocks, prints one job, the model runs the skill, reports via `home.py status`). Human approval is a second **`review.py … wait`** server that *blocks the pipeline*. **There is no MCP server anywhere** — portability to Codex/Cursor is just extra `*-plugin/plugin.json` files pointing at the same skills.

## 2. The transferable "laws" (what makes it good)

1. **One canonical JSON model per project; stateless tools read it and rewrite it.** Stages couple only through on-disk JSON shapes, documented in one `contracts.md` (a CI test keeps copies in sync). → *We already have this: `DesignDoc` + `Scene.groups` etc., and pure ops in `apps/web/lib/studio/ops.ts`.*
2. **Separate the editorial model from the render plan.** `decisions.json` (EDL, source coords) ≠ `plan.json` (flattened, fully-computed, renderer-ready props). → *Ours: the `DesignDoc` is editorial; `scenesAsPages`/`frames.ts` output is the render plan. `recomposeSceneGroups` is our "compile to timeline".*
3. **Code measures; cheap models judge; the big model decides only what's left.** All geometry/timing/number work is deterministic code; the LLM only does fuzzy editorial judgment on *tiny* context and **never emits coordinates/timestamps** ("no model types a timestamp"). Models quote/choose; code resolves quotes → indices and validates the edit still "builds".
4. **Critic/judge gating with deterministic apply + hard round caps.** A cheap agent grades against a *fixed checklist*, returns **applyable fixes**; a script applies them; loop ≤N rounds; the critic runs **before** the human sees it. The cut-judge even **demotes itself to suggest-only** when <60% of its past changes survived review ("earn your autonomy").
5. **Approval is a physical, verifiable artifact.** The plan gets a **stamp**; the mutating/spending script **refuses** without it, and refuses if inputs changed after approval. Gates are layered: soft (skill text) + hard (gate script) + pre-human critic + **eval cases that test the gate behaviorally**.
6. **Fan-out = one subagent per independent unit, all launched in one message, each returns small JSON;** orchestrator merges JSON, never opens the big artifacts (keeps context small). A **background "prep" agent** speculatively runs free/cheap steps *during* a human gate.
7. **Taste store** = scoped (this-item / this-style / global / everyone), persisted *outside* the app, merged through **one hook** with a clear precedence order, every rule counted + regression-tracked; each saved style becomes a regenerated skill with a "learned from feedback" section.
8. **Determinism is engineered:** paused+seeked animation timelines, seeded RNG, pinned asset hashes, frame count from stream packets (not dur×fps), half-frame-early trims, frames-in==frames-out asserts, **pixel-diff golden tests per-OS**, a determinism harness that renders a frame twice and byte-compares.
9. **Three test tiers:** per-script `demo()` self-checks (unit) · e2e + golden renders (integration) · **behavioral evals** (`prompt.md` + `tool_used`/`llm` graders, run as a *dry-run* via `append_system_prompt`), gated to paid CI.
10. **`PRINCIPLES.md` read first by every skill:** ask via one question-box (recommended-first); plan-before-act with cost; never auto-spend/publish/destroy without an explicit yes; real assets only, no invented stats/palette; "never close the loop with a note alone — a rule with no enforcement and no test is not done."

## 3. How our Studio already maps

| Reference | Our Studio today |
|---|---|
| canonical JSON edit model | `DesignDoc` (scenes/nodes/groups), workspace JSON (AC75) |
| tools = scripts over the JSON | **pure ops in `lib/studio/ops.ts`** (add/move/group/recompose…) — already pure + deterministic |
| EDL → render plan compile | `recomposeSceneGroups` + `scenesAsPages` + `frames.ts` |
| deterministic renderer | `frames.ts` (Fabric offscreen) → MP4; `pdf.py`; preview == export contract |
| "code measures, model judges" | the Builder agent + AI provider layer (Claude/OpenAI/Gemini, stub in tests) |
| determinism in tests | 208 vitest + golden-ish; Contract 4 (AI mocked, same inputs→same output) |

**Key insight:** the reference's hardest-won asset — *a pure, serializable op layer over a canonical JSON model* — **we already built** (this is exactly the memory note "every studio capability must be workspace-JSON + a pure op (MCP tools incoming)"). The harness is mostly *exposing* those ops to an agent + adding the orchestration/gates/evals discipline.

## 4. The one real divergence (drives the design)

The reference is a **local, single-user tool** where **Claude Code is the backend** and tools are local Bash scripts. Our Studio is a **hosted web app** (Next.js + FastAPI + Postgres/MinIO) serving many agents. So "who is the agent, and where do the tools run?" has **two valid targets**:

- **(A) In-product "AI Builder" agent** — the agent lives *inside* the Studio product (what tourism agents use). Tools = the pure ops, invoked via **LLM tool-use** (our existing AI provider layer / Builder) over the live workspace. An **MCP server** is worth it here *only if* we also want external hosts (Claude Desktop/Code) to drive a user's workspace.
- **(B) Dev/operator Claude-Code harness** — a plugin (like the reference) that drives the Studio from a terminal for building/QA/demos. Tools = scripts/MCP calling our API or the pure ops; local review-server gates.

These share one foundation: **a tool layer over the pure ops + the workspace JSON**. MCP is the natural shape **if we want the ops callable from multiple hosts**; otherwise the in-app Builder already *is* a tool-use loop and needs no MCP.

## 5. Proposed harness (target-agnostic core, then the host adapter)

**Core (build once):**
1. **`studio-ops` tool surface** — wrap the existing pure ops as a typed, JSON-in/JSON-out tool catalog over a workspace document: `addText/addImage/group/nest/setGroupEnter/recompose/…/renderPreviewFrame`. Each tool = pure op + a schema + a one-line result. (This is the reference's "scripts contracted by SKILL.md" as typed tools.)
2. **A workspace contract + validator** — `DesignDoc`/`Scene.groups` is the contract; add a `validate(design)` that every tool call passes (the "edit still builds" rule) + a `renderThumb → assert element present/legible` check (our analogue of verify-by-re-measuring + the contrast/golden-tile pattern).
3. **Subagents:** `studio-builder` (composes from a brief + catalog, grounded — extends the existing Builder), `brand-safety-critic` + `legibility-critic` (fixed-checklist graders over a rendered thumbnail, emit applyable ops, ≤N rounds, run pre-human), `render-watcher` (MP4), a `prep` agent for speculative work during a gate.
4. **Approval gates as artifacts:** the agent proposes a **set of ops / a candidate workspace version**; export/publish refuses until a `stamp` (approved + unchanged-since). Layer: soft (skill) + hard (export/publish endpoint) + critic + eval.
5. **Taste store:** per-agent/org brand-kit + corrections, scoped + merged via one hook into the Builder's choices (reuse the brand-kit/AC87 machinery).
6. **Eval harness:** `prompt.md` + `tool_used`/`llm` graders for agent behavior (did it ground in the catalog? did it gate before publish? did it fan out per asset?), dry-run via `append_system_prompt`, gated CI.

**Host adapter (pick per target):**
- **MCP server** exposing `studio-ops` over stdio (for Claude Code/Desktop to drive a workspace) — fits the memory note's "MCP tools incoming".
- **or** in-app Builder tool-use (our AI provider layer) calling the same `studio-ops` — no MCP.
- **or** a Claude Code plugin (skills + the MCP/scripts + a local review server) for the dev/demo harness.

## 6. The MCP question — recommendation

The reference deliberately **avoids MCP** and it's the right call *for a local single-user tool*. For us, MCP is **justified only if** the design ops should be callable by **external hosts** (Claude Code/Desktop driving a user's Studio workspace) — which the memory note suggests is the intent. Either way, the **MCP server is a thin host adapter over the `studio-ops` core**; we should **build the pure tool core first** and add the MCP adapter second, so the same tools also power the in-app Builder.

## 7. Suggested first milestone (after the scoping decision)

Build the **`studio-ops` tool core + validator + one critic + an eval** over the existing `DesignDoc`/`ops.ts`, exposed through whichever host the user picks (MCP server vs in-app Builder vs Claude-Code plugin). Then layer orchestration + gates. Start small: a `compose-from-brief` flow (brief → grounded ops → recompose → thumbnail → legibility critic → user approves) end-to-end, with an eval that asserts grounding + the publish gate.

---
*Open decision for the user: which host target leads — (A) in-app AI Builder agent, (B) external-host MCP server, or (C) a Claude-Code dev/demo plugin — recognising all three sit on the same `studio-ops` core.*

---

## 8. Follow-up — op catalog coverage (opened 2026-10-12)

**Status:** the shipped `studio-ops` catalog is a deliberate starter subset — **6 ops**
(`write-copy`, `place`, `add-shape`, `set-background`, `add-scene`, `set-scene-duration`). The
pure op layer (`apps/web/lib/studio/ops.ts`) already exposes **~50+** Studio operations the agent
cannot yet reach, so the AI Builder/MCP can currently do only a fraction of what a human can in the
Studio.

**Action:** extend the catalog toward **full Studio parity** in future iterations. Each new op
stays host-agnostic (workspace-JSON in/out, a pure op from `ops.ts`) and keeps Contract 1 grounding
for anything that references a catalog item. Known gaps, grouped:

| Area | Missing ops (from `ops.ts`) |
| --- | --- |
| Node editing | `editText`, `moveNode`, `resizeNode`, `updateNode` (rotate/opacity/style), `deleteNode`, `duplicateNode`, `reorderNode` (z-order) |
| Animation | `setNodeAnim` / `enterTrack` (entrance + emphasis loop), per-node keyframes |
| Groups & nesting | `groupNodes`, `ungroupNodes`, `renameGroup`, `setGroupAnim`, `updateGroupStyle`, `deleteGroup`, `duplicateGroup` (recompose stays automatic) |
| Sprites | `addGraphic` + sprite chains (`addSuccessorSprite`, `setChainDuration`, `removeSuccessor`) |
| Curves | `addCurve`, `setCurvePoints`, `insertCurveAnchor`, `translateCurve`, `moveCurvePoint` |
| Scenes | `removeScene`, `reorderScene`, `setSceneTransition`, `renameScene`, `setSceneNarration` |
| Images | `addPlaceholder`, `fillImageNode` (grounded) |

Anchored in code at `apps/web/lib/studio/studio-ops.ts` (the `const OPS` catalog TODO). Grow it in
slices (e.g. node-editing first, then animation, then groups), each slice landing with its own
tests + a spec round-trip, so `GET /ai-agent/studio/ops/spec` stays the single source of truth for
host tool lists.

---

## 9. Agent architecture — one loop: act + observe, sub-agents later (2026-10-12)

The AI Builder is **one loop** with tools to **act on** and **observe** the workspace. Shipped as
`apps/api/app/ai/studio_agent.py` + `POST /ai-agent/studio/agent` (the *inbuilt* host; an MCP host
runs its own loop over `/ai-agent/studio/ops/*`). The protocol is an **open set of action kinds** —
extend the loop by adding a kind, never a parallel endpoint.

| Capability | Action kind | Status |
| --- | --- | --- |
| Disclose op params on demand (context-cheap) | `describe_ops` | ✅ done |
| Act on the workspace (grounded, validated) | `apply` | ✅ done |
| Stop when the brief is met | `finish` | ✅ done |
| Observe — **passive** summary pushed after each apply | (feedback) | ✅ done |
| Observe — **active** pull: word description of each scene (no render) | `observe` | ✅ done |
| Sub-agents as tool-calls (critic, legibility check → small JSON verdict) | `call_subagent` | ⏳ later, "when the need calls for it" |

**Observability by description, not by pixels (2026-10-12).** Rather than render a scene and analyse
the image, each scene carries a DERIVED natural-language description (`apps/web/lib/studio/describe.ts`,
`describeScene`): a pure projection of scene state (text + position + size, images named by catalog
title, shapes, background, entrances/loops/sprite-chains with timing, group nesting). It is never
hand-patched — it is RECOMPUTED from the scene whenever the scene changes, which guarantees accuracy.
Refreshed on web autosave (manual edits) and recomputed on demand by the `observe` tool
(`POST /api/studio-ops/observe` → facade `POST /ai-agent/studio/ops/observe`); stored on
`scene.description` and round-tripped via migrate/clone. No server-side rasterizer and no provider
multimodal support were needed (both confirmed absent today) — the structured model makes words more
accurate and far cheaper than vision.

**Principles carried forward:** progressive disclosure (ask for the slice you need), never echo the
full `DesignDoc` into model context, every acting op stays grounded (Contract 1), and every new
capability lands with hermetic tests via a scripted fake provider + fake act/observe fns. Sub-agents
reuse the reference repo's fan-out pattern (§1–§5): one unit per call, one message, small-JSON return.

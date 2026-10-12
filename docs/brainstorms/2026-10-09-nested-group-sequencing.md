# Brainstorm — Nested group editor with sequenced animation

**Date:** 2026-10-09 · **Charter:** `docs/plans/2026-10-09-requirements-charter.md` ·
**Branch:** `feat/studio-nested-groups` · **Phase:** B (build loop, outer 0/3)

## 1. Frame

**Goal.** Give grouped studio objects a sprite-edit-style tree (group + nested sub-groups +
elements), per-row editing, arbitrary-depth nesting, and **strict parent-first** timing — a
child stays hidden during its parent group's entrance, then plays — with **preview == export**
and round-trip persistence (AC1–AC8).

**Inputs / constraints (from the codebase):**
- The engine `nodeStateAt` is group-blind and pure; preview (`StudioCanvas.previewAt`) and export
  (`frames.ts renderSceneFrames`) each independently sample it, so any timing mechanism must land
  identically in both — Contract 4 (reproducible; preview==export).
- Today `groupId` is a flat tag and `setGroupAnim` stamps the *same* entrance on every member at
  `t=0` (`apps/web/lib/studio/ops.ts:1190`-area) — simultaneous, non-nestable.
- The only existing sequencing primitive is the sprite chain: `successorId` → cumulative
  `seg.start` + `extendSceneForChain` grows `durationMs` or frames truncate
  (`apps/web/lib/studio/ops.ts:714,733,799-803`). `enterTrack(node,type,startMs,durMs)` already
  builds an entrance keyframe track at an arbitrary start (`ops.ts:1115`).
- `migrateDesign` rebuilds scenes field-by-field and drops unknown fields, so any new scene state
  must be explicitly carried to round-trip.

**Out of scope (charter non-goals):** per-element *scene* transitions, drag-to-reorder in the
tree, group-level custom dope-sheets.

The real design variance across the open ACs is the **timing mechanism (AC4/AC5)**: the data
model (`Scene.groups` registry, `parentId`, AC1/AC3/AC6) and UI (reuse sprite panel + Inspector,
AC2/AC7) are largely settled. The three approaches below differ in *where the parent-first delay
is resolved*.

## 2. Prior art

**Internal:** `docs/solutions/INDEX.md` is empty (no prior entry); `.claude/rules/critical-patterns.md`
is empty. Relevant memory: `studio-svg-animation-rasterization` (motion must be keyframe-engine node
transforms, not in-SVG SMIL) and `studio-json-serializable-for-mcp` (every capability must be a
workspace-JSON + pure op) — both favour keeping timing in the pure, serializable node/scene model
rather than a side timeline. The sprite chain (`ops.ts:714-860`) is the in-repo precedent for
"bake cumulative offsets + grow the scene."

**External:** see citations per approach.

## 3. Approaches

### Approach A — Bake per-member start-offsets into keyframes at author time (recompose)
Add `Scene.groups: {id,parentId?,name?,anim?}[]`; node `groupId` = innermost group. A pure
`recomposeSceneGroups(scene)` runs after every group/nesting/anim mutation: for each node it walks
`parentId` ancestry, sums the entrance durations of ancestor groups *above the chosen layer* into a
`startDelay`, and writes baked keyframes via `enterTrack(node, type, startDelay+ownStart, dur)`
(or shifts a custom track's `t`). It grows `durationMs` to fit the latest child. The engine,
preview and export are **unchanged** — they read the baked keyframes.
- **Fits contracts:** preview==export is automatic (one keyframe source of truth → Contract 4);
  pure op → JSON-serializable and unit-testable (memory: MCP-serializable); mirrors the proven
  sprite-chain pattern already in the repo.
- **Effort:** medium — one recompose fn + hierarchy helpers + migrate carry + wire into ~6 ops.
- **Risk:** recompose must stay idempotent (store the author's element-relative start separately
  from the baked delay) or repeated edits drift; keyframe sets are regenerated on each list/timing
  change.
- **Source:** *Different Approaches for Creating a Staggered Animation — CSS-Tricks —*
  <https://css-tricks.com/different-approaches-for-creating-a-staggered-animation/> (accessed 2026-10-09).
  Documents folding the stagger wait into keyframe percentages so the whole sequence "doesn't go
  out of sync," at the cost of regenerating one keyframe set per element — exactly this trade-off.

### Approach B — Thin runtime offset: resolve the delay at sample time, don't mutate keyframes
Keep `Scene.groups` for ancestry, but do **not** bake. Add one shared pure helper
`nodeStartDelay(scene, node)` and call it in both sample sites so they pass a shifted `localT`
(`nodeStateAt(node, t - startDelay)`), with the node held hidden for `t < startDelay`. Keyframes
stay author-relative; only the effective time shifts. Scene duration still grows for export.
- **Fits contracts:** keyframes stay clean/minimal; still one math path if the helper is shared by
  `previewAt` and `frames.ts`.
- **Effort:** medium — but touches the two hot sample paths (preview + export) that the charter
  wants kept in lockstep; must also feed the chain/`localT` logic without double-counting.
- **Risk:** **two independent call sites** must apply the identical offset or preview≠export
  (direct Contract 4 hazard); the W3C thread notes per-child offsets are "very cumbersome" to keep
  consistent and only meaningful inside the group context. Higher blast radius on the engine's hot
  path than A.
- **Source:** *[csswg-drafts] Staggering children of effects inside GroupEffect (#9561) — W3C CSS
  WG archive —* <https://lists.w3.org/Archives/Public/public-css-archive/2023Nov/0136.html>
  (accessed 2026-10-09). Proposes computing a per-child offset and adding it to each child's own
  delay — the runtime-offset model — and flags its consistency cost.

### Approach C — First-class nested timeline / scene-graph time remap (groups as timeline nodes)
Model groups as timeline nodes with `start`, `duration`, `timeScale`; sample top-down, mapping
`parentLocal = start + childLocal * timeScale` recursively (GSAP/Construct nested-timeline model).
The engine gains a group-aware traversal; children inherit parent timing (and could later inherit
speed/reverse).
- **Fits contracts:** most expressive; natural home for future group easing/scrub.
- **Effort:** **high** — a genuine engine extension + recursive mapping in both sample sites +
  reverse/clamp handling; over the PoC bar.
- **Risk:** largest rewrite of the pure engine the whole app depends on; recursion/clock-mismatch
  pitfalls (the search notes mismatched time bases drift children out of alignment); YAGNI against
  the charter (no scrub, no group timeScale in scope).
- **Source:** *Timeline — GSAP docs —* <https://gsap.com/docs/v3/GSAP/Timeline/> (accessed 2026-10-09).
  Canonical nested-timeline model: child playback slaved to the parent playhead via mapped
  startTime — the pattern this approach would reimplement.

## 4. Compare & recommend

| Approach | Effort | Main risk | Source |
|---|---|---|---|
| **A — bake offsets into keyframes (recompose)** | medium | recompose idempotency | CSS-Tricks (cited) |
| B — thin runtime offset at sample time | medium | two sample sites drift → preview≠export | W3C GroupEffect thread (cited) |
| C — first-class nested timeline engine | high | big engine rewrite; over-scope | GSAP Timeline docs (cited) |

**Recommend A.** It keeps the single source of timing truth in the baked keyframes, so
preview==export (Contract 4) holds *for free* with the engine untouched, reuses the repo's own
proven sprite-chain "bake cumulative offset + grow scene" pattern, and stays a pure, serializable
op (aligns with both relevant memory notes). It matches the charter decision D6 and fits the PoC
time-box; B spends the same effort on the one hot path the charter most wants protected, and C is
a larger engine rewrite the non-goals don't justify.

**Trade-off accepted:** keyframes are regenerated on every group/timing edit, and recompose must
preserve each node's author-relative start separately from the baked delay to stay idempotent —
guarded by a dedicated idempotence unit test (`group-sequencing.test.ts`).

## 6. Decide

Chosen: **Approach A**. Proceeding to `/oneshot-poc:plan` (the design doc
`ethereal-nibbling-swing.md` already elaborates A; plan phase refines its op list + test matrix).

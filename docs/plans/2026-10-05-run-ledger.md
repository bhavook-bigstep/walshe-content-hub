# Run ledger — Storyboard studio (AC46–AC47)

Durable state for the `/oneshot-poc:run` building Phase 2 + Phase 3 of the storyboard studio.
Every phase reads this first and appends when done. Content-free: status + decisions only.

- **Charter (full):** `docs/plans/2026-10-05-studio-storyboard-charter.md` (v1.0.0, confirmed)
- **Design doc:** `docs/plans/2026-10-05-studio-storyboard-design.md`
- **Branch:** `feat/content-hub-poc`
- **Engine note:** run **directly** (implement → parallel review subagents → fix → acceptance),
  per in-session evidence the bundled build-loop workflow false-negatives on this repo (see
  `2026-10-03-run-ledger.md`). Independent `make verify` is the authoritative acceptance gate.
- **Current phase:** `⏸ G` (acceptance MET — 47/47; reviews applied; awaiting human verification)
- **Outer loop:** `1` · **Inner loop:** `1`

## Requirement status (acceptance checklist)

| # | Requirement | Status | Evidence / note |
|---|-------------|--------|-----------------|
| AC46 | Multi-scene storyboard (scenes[] + pure ops + multi-artboard canvas + scene controls) | met (3/3) | `lib/studio/ops.ts` scenes[] model + pure ops (add/remove/reorder/duration/transition/rename) + `migrateDesign`; `StudioCanvas` multi-artboard + connectors + active highlight + click-select + scene-aware write-back; `SceneControls` rail; `scenesAsPages` keeps server export. vitest `test_scene_ops_storyboard`/`test_migrate_legacy_pages_to_scenes`; e2e `storyboard-smoke`. AC8/9/12/18 stay green. |
| AC47 | Stitch scenes → video (per-scene duration+transition xfade, caption+TTS, Contract 1, deterministic) | met (6/6) | `media/video.py` per-scene duration+transition, `build_xfade_cmd`/`build_join_concat_cmd`, xfade chain + hard-cut fallback, silent-audio uniform clips; `render.py` VideoScene += duration_ms/transition; `storyboard-video.ts` design→request; top-bar "Generate video". pytest (script/xfade/hardcut/fallback) + vitest + e2e. VideoPanel folded in (deleted). |

## Phase log (increment)

- **D IMPLEMENT** — AC46 (web model + canvas + controls) then AC47 (server video + wiring +
  shared-types regen). tsc clean; vitest 23; api video 9/1-skip; studio+storyboard e2e green.
- **governance** — REQUIREMENTS v2.11.0 (AC46–47 + changelog) + manifest proofs. `make verify`
  **47/47 met**, sync OK.
- **E REVIEW** — 4 parallel reviewers (security · architecture · code-quality · tests). All
  **APPROVED_WITH_COMMENTS**, no P1. P2 fixes applied: SRT caption timing now overlap-aware
  (xfade sync bug); `migrateDesign` guards unknown format + dedupes scene ids + filters malformed
  nodes; node ids derive from `scene.id` (collision-free across reorder); dead `addPage` alias
  removed; `renameScene` wired into SceneControls; `applyBranding` reuses `cloneDesign`;
  `pageIndex→sceneIndex` rename finished; `_join_cmd` dedup; fallback logs. Tests strengthened
  (route pass-through + 422, xfade clamp/xfade=False/mixed, SRT timing, migration + mapper edges).
- **F ACCEPTANCE** — `make verify` **47/47 met** (AC46 3/3, AC47 6/6), sync OK, tree builds.
  Every charter item (AC46.1–46.5, AC47.1–47.5) maps to a passing proof.

## Phase log

- **A/A2** — Intake + scope QA done. User confirmed charter v1.0.0. Decisions: Phase 2+3 only
  (no Phase 4 preview); video = caption overlays + local TTS narration per scene.
- **B BRAINSTORM** — folded into the confirmed design doc + charter (design-first epic).
- **C PLAN** — AC46 before AC47 (AC47 depends on the `scenes[]` model). Pure-ops + model first
  (vitest-able), then canvas UI, then server video extension (pytest-able), then editor wiring + e2e.

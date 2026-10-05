# Requirements Charter — Design Studio: storyboard canvas → video

**Date:** 2026-10-05 · **Version:** 1.0.0 · **Status:** for confirmation
**Epic:** Multi-scene storyboard studio (Phase 2 + Phase 3 of
`docs/plans/2026-10-05-studio-storyboard-design.md`)
**Branch:** `feat/content-hub-poc` (local only — never pushed unattended)

## Context

Phase 1 (editor shell — Canva/CorelDraw-style pannable dot-matrix canvas) shipped as a UX
redesign in `96526ff`; its behaviour stays governed by **AC8/AC9/AC12 + studio-smoke (AC18)**,
all green. No AC was minted for Phase 1 (pure UX), so this epic's new acceptance items are
**AC46 (Phase 2)** and **AC47 (Phase 3)** — one number earlier than the design doc's draft
(AC47/AC48), because Phase 1 did not consume AC46.

**AC45 (observability + LangSmith) is complete and separate.** Current governed total: 45 ACs.

## Scope decisions

| # | Decision | Value | Reason | Provenance |
| --- | --- | --- | --- | --- |
| D1 | Run scope | Phase 2 (storyboard) + Phase 3 (stitch→video) only | Tightest PoC slice; the MP4 is the real artefact | `[explicit]` |
| D2 | In-canvas preview (Phase 4) | **Deferred** (not this run) | Preview is polish; the MP4 proves the sequence | `[explicit]` |
| D3 | Scene connections | Auto-sequential chain (array order = `1→2→3`); reorder rewrites order | No free-form graph in v1 | `[explicit]` (design doc) |
| D4 | Per-scene animation | One `transition` into the next scene + per-scene `durationMs`; **no per-element keyframes** | Keeps v1 bounded | `[explicit]` (design doc) |
| D5 | Transition kinds | `none` · `fade` · `slide-left` · `zoom` | Map 1:1 to ffmpeg xfade modes (`none` = hard cut) | `[inferred]` |
| D6 | Duration defaults | default 4000 ms; clamp 500–15000 ms | Sensible, deterministic clamps | `[inferred]` |
| D7 | Video content | **Caption overlays + local TTS narration** per scene, synced captions | Richer demo; reuses existing 503-safe TTS (`say`/espeak) | `[explicit]` |
| D8 | Caption source | Scene's first text node → fallback to the scene's catalog item title | Provenance-preserving, no new field needed | `[inferred]` |
| D9 | Imagery | Approved, visible catalog assets only (Contract 1 via `services/visibility`) | Brand-safety is the product's value | `[requirement]` (Contract 1) |
| D10 | Source of truth | Pure serialisable design model (`scenes[]`); canvas is a view; export unaffected | Contract 4 / AC9 — testable without a DOM | `[requirement]` (AC9) |
| D11 | Backward compatibility | `pages → scenes` migration with `id/name/durationMs/transition` defaults; `pages` kept as read alias during migration | PDF/HTML export + existing tests keep reading `pages` | `[inferred]` |
| D12 | Determinism | TTS + ffmpeg subprocess + tool lookup stay injectable; unit tests assert argv/script shape, not encoding; AI stubbed | Contract 4 — reproducible, hermetic tests | `[requirement]` (Contract 4) |
| D13 | ffmpeg xfade fallback | Hard-cut concat when xfade unavailable; render stays 503-safe | Matches current AC13 robustness | `[inferred]` |

## Acceptance checklist (the contract)

### AC46 — Multi-scene storyboard (Phase 2)
- **AC46.1** The design model carries `scenes: Scene[]` where
  `Scene = { id, name, background?, nodes[], durationMs, transition }`; a single-scene doc equals
  today's doc (migration `pages→scenes`, defaults `durationMs=4000`, `transition="fade"`).
- **AC46.2** New **pure, deterministic, non-mutating** ops exist and are unit-tested:
  `addScene`, `removeScene`, `reorderScene(from,to)`, `setSceneDuration(id,ms)` (clamped 500–15000),
  `setSceneTransition(id,kind)`, `renameScene(id,name)`. Same inputs → identical output.
- **AC46.3** The canvas shows **multiple artboard frames** laid out in sequence with
  **connector arrows** between consecutive scenes; the active scene is highlighted and new content
  lands on it.
- **AC46.4** The right toolbar's **Scene** controls add / remove / **reorder** scenes and edit the
  active scene's **duration** (slider/number) + **transition** (picker).
- **AC46.5** Existing studio ACs stay green: **AC8** (format), **AC9** (pure model ops),
  **AC12** (PNG/PDF/HTML export), **AC18** (studio-smoke e2e). Move/resize still writes back through
  the pure ops.

### AC47 — Stitch scenes → video (Phase 3)
- **AC47.1** `VideoScene` / `build_scene_script` gain **`duration_ms`** (clamped) and
  **`transition`**; the encoder joins scenes with ffmpeg **xfade** (fade/slide/zoom → matching mode;
  `none` = hard cut), falling back to hard-cut concat when xfade is unavailable (503-safe).
- **AC47.2** Each scene contributes a **caption** (scene text node → fallback item title) rendered as
  a drawtext overlay, with **local TTS narration** per scene and synced captions (TTS absent → silent,
  no failure).
- **AC47.3** Scene images resolve to `item_id` and are pulled **only from visible catalog entries**;
  hidden/expired/off-limits items are dropped server-side (**Contract 1**).
- **AC47.4** pytest asserts the **deterministic** scene-script/argv shape — per-scene durations, xfade
  filters, caption/TTS wiring — without actually encoding (subprocess injected). Same inputs → same script.
- **AC47.5** The editor's **"Generate video"** action serialises the ordered scenes → `VideoRequest`
  → downloads the MP4; a Playwright smoke drives editor → download (stubbed/short render).

## Out of scope (scope guard)
Per-element keyframes · free-form node graph · generative imagery (asset selection only) ·
in-canvas Play preview (Phase 4, deferred) · branching edges · audio mixing beyond per-scene TTS.

## Governance
On approval: promote **AC46, AC47** to `/REQUIREMENTS.md` (bump to v2.11.0 + change-log rows) and
`requirements.manifest.yaml` (map to the new vitest/pytest/e2e node-ids); `make verify` is the gate.

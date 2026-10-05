# Design — Design Studio: storyboard canvas → video

**Date:** 2026-10-05 · **Status:** for approval (design-first, per the user) · **Author:** user + Claude

## 1. Vision

Turn the Design Studio into a **Canva/CorelDraw-style workspace** that is also an **n8n-style scene
storyboard**: an infinite **dot-matrix canvas** holding one or more **scene frames** (artboards).
Each scene has its own **duration (lifespan)** and a **transition**; scenes are **connected in
sequence**, and **stitching the sequence renders a video** — scene 1 plays for its duration, a
transition runs, scene 2 plays, and so on → one MP4.

Confirmed scope decisions:
- **Design-first** (this document), then build in phases.
- **Auto sequential chain**: scenes are ordered and auto-connected `1 → 2 → 3`; reordering changes
  the sequence. (No free-form n8n graph in v1.)
- **Per-scene transition** animation in v1 (fade / slide / zoom between scenes). **No per-element
  keyframes yet.**

Preserved product contracts: images come **only from approved, visible catalog assets** (Contract 1
via `services/visibility`); the pure, serialisable **design model** stays the source of truth
(Contract 4 / AC9 — testable without a DOM); the model gateway + existing PDF/HTML/MP4 exports keep
working.

## 2. Data model (extends `apps/web/lib/studio/ops.ts`)

Today a `DesignDoc` has `pages: DesignPage[]` where a page is `{ background?, nodes[] }`. We promote a
page to a **Scene** and add storyboard fields. Backward compatible: a single-scene doc is today's
doc.

```ts
type TransitionKind = "none" | "fade" | "slide-left" | "zoom";

interface Scene extends DesignPage {   // = { background?, nodes: DesignNode[] }
  readonly id: string;                 // deterministic: "scene-n<k>"
  name: string;                        // "Scene 1"
  durationMs: number;                  // lifespan (default 4000; clamp 500..15000)
  transition: TransitionKind;          // transition INTO the next scene (default "fade")
}

interface DesignDoc {
  format: FormatName;                  // artboard size for every scene
  width: number; height: number;
  scenes: Scene[];                     // ordered; the auto-sequential chain IS this order
}
```

- **Connections = order.** v1 has no separate edge list: the chain is `scenes[i] → scenes[i+1]`.
  The canvas draws connector arrows between consecutive scenes; "reorder" (drag handle / move
  left-right / up-down) rewrites the array order. (A future `edges: [{from,to}]` can add branching
  without breaking this.)
- New pure ops (all deterministic, non-mutating — keeps AC9 style): `addScene`, `removeScene`,
  `reorderScene(from,to)`, `setSceneDuration(id,ms)`, `setSceneTransition(id,kind)`,
  `renameScene(id,name)`. Existing node ops (`addText/addShape/addCatalogImage/moveNode/resizeNode/
  editText/setBackground`) gain a `sceneIndex` (was `pageIndex`). `pages` is kept as an alias/getter
  during migration so the PDF/HTML export and existing tests keep reading `pages`.
- **Migration:** `pages → scenes` with `id`, `name`, `durationMs=4000`, `transition="fade"` defaults.
  The server PDF/HTML export reads `scenes` (or `pages`) unchanged (still a list of `{background,
  nodes}`); it ignores duration/transition.

## 3. Editor UX

```
┌───────────────────────────────────────────────────────────────┐
│  TOP MENU BAR (fixed)                                          │
│  Studio ▸ Format ▸ | Add: Text  Image  Shape | Zoom −  100% +  │ Fit | Save | Generate video │
├──────────────────────────────────────────────┬────────────────┤
│  DOT-MATRIX CANVAS (pannable / zoomable)       │ RIGHT TOOLBAR  │
│                                                │ (fixed, tabs)  │
│   ┌─ Scene 1 ─┐      ┌─ Scene 2 ─┐             │  • Scene       │
│   │  artboard │ ──▶  │  artboard │ ──▶  (+)    │    duration,   │
│   │  (content)│      │  (content)│             │    transition  │
│   └───────────┘      └───────────┘             │  • AI Builder  │
│     4.0s · fade        3.0s · zoom             │  • Creative    │
│   · · · · dots everywhere · · · ·              │    Plan        │
│                                                │  • Personalise │
│                                                │  • Export      │
└──────────────────────────────────────────────┴────────────────┘
```

- **Dot-matrix everywhere** (artboards + surround): a dotted field behind the Fabric canvas, kept in
  sync with the canvas viewport transform (pan/zoom), n8n-style. Each scene is an **artboard frame**
  (bordered + soft shadow, transparent so dots show through unless a background colour is set).
- **Navigation:** pan (space-drag / middle-mouse / scroll), zoom (ctrl/⌘-wheel + top-bar buttons),
  "Fit" to frame all scenes. Scenes are laid out left-to-right (then wrap) with **connector arrows**
  drawn between consecutive scenes.
- **Top menu bar (tools, fixed):** format picker (labelled "Format"), Add Text (+ "Text content"
  field) / Add Image (from catalog) / Add Shape, zoom controls, **Save**, **Generate video**. (The
  e2e-relied-upon labels — Format, Add image, Text content, Add text, Export PNG/PDF — are kept.)
- **Right toolbar (options, fixed, tabbed):** **Scene** (duration slider + transition picker +
  add/remove/reorder scene), **AI Builder**, **Creative Plan**, **Personalise**, **Export**.
- **Content:** select a scene to make it active; place text/image/shape onto it; **drag to move /
  handles to resize** write back to the model (`moveNode`/`resizeNode`). The selected scene is
  highlighted; new content lands on it.
- **Interactive canvas ↔ model:** render is model→canvas; user gestures (`object:modified`) write
  back through the pure ops, so the model stays the single source of truth and export is unaffected.
- **Full-res export stays correct:** PNG renders the active scene from the model on an **offscreen
  full-resolution canvas** (decoupled from the on-screen pan/zoom); PDF/HTML/MP4 already go through
  the model server-side.

## 4. Scene lifespan + transitions (v1)

- **Duration:** per-scene `durationMs` (editable slider/number; default 4s). Shown under each scene.
- **Transition:** per-scene `transition` = the effect **into the next scene** — `fade` / `slide-left`
  / `zoom` / `none`. One per scene; no per-element timing in v1.
- **Preview:** a lightweight in-canvas "Play" steps scene→scene honouring durations + a CSS
  transition, so the agent can preview before rendering (optional in v1; the real artefact is the MP4).

## 5. Stitch → video pipeline

Reuse the existing MP4 service (`POST /render/video`, `apps/api/app/media/video.py`, AC13). It already
takes an **ordered scene list** (item_id, title, caption) and encodes ffmpeg zoompan + drawtext, with
images pulled **only from visible catalog entries**. Extensions:

1. **Per-scene duration:** `VideoScene` gains `duration_ms` (clamped); `build_scene_script` uses it
   instead of the fixed 4s. Deterministic (same inputs → same script).
2. **Per-scene transition:** `VideoScene` gains `transition`; the encoder joins scenes with ffmpeg
   **xfade** (fade/slide/zoom → the matching xfade mode; `none` = hard cut). Falls back to hard-cut
   concat if xfade is unavailable (503-safe as today).
3. **Scene image source:** each editor scene maps to its first catalog image node → `item_id`
   (provenance preserved; hidden/expired/off-limits items are dropped server-side, Contract 1).
4. **Editor action:** "Generate video" serialises the ordered scenes → `VideoRequest` → downloads the
   MP4. (`VideoPanel` is folded into this.)

Determinism/tests: the subprocess + tool lookup stay injectable, so unit tests assert the **argv /
script shape** (durations, xfade filters) without encoding — exactly as AC13 does now.

## 6. Phasing + proposed acceptance items

> Note: **AC45 (observability + LangSmith)** from the prior epic is still open and separate. This
> studio epic proposes **AC46–AC49** (final numbers confirmed when promoted to `/REQUIREMENTS.md`).

- **Phase 1 — Editor shell** → **AC46**: dot-matrix pannable/zoomable canvas; fixed top menu bar +
  right toolbar; a single artboard frame; place/move/resize content with model write-back; offscreen
  full-res PNG export. All existing studio ACs (AC8/AC9/AC12) stay green; studio-smoke updated.
- **Phase 2 — Multi-scene storyboard** → **AC47**: multiple scene frames on the canvas with
  auto-sequential connectors; add/remove/**reorder** scenes; per-scene **duration** + **transition**
  controls; the model carries `scenes[]`. Pure ops are unit-tested (deterministic).
- **Phase 3 — Stitch → video** → **AC48**: "Generate video" renders the ordered scenes (durations +
  transitions, images from approved catalog) to an MP4 via the extended `/render/video`; pytest
  asserts the deterministic scene-script/xfade shape; Playwright drives the editor → download.
- **(Optional) Phase 4 — Preview** → **AC49**: in-canvas play of the sequence honouring durations +
  transitions before rendering.

## 7. Risks / notes
- **Fabric interactive canvas** (pan/zoom + dotted sync + drag write-back) is the main implementation
  risk; mitigated by keeping the model one-way-render + write-back-on-modify, and decoupling export.
- **Multi-artboard in one Fabric canvas**: scenes are rects in one scene-space; the active scene is
  an offset region. Alternative (one Fabric canvas per scene) is simpler to reason about but heavier
  in the DOM; v1 uses **one canvas, multiple artboard regions**.
- **xfade** availability varies by ffmpeg build; hard-cut fallback keeps the 503-safe contract.
- **Scope guard:** no per-element keyframes, no free-form node graph, no generative imagery (asset
  selection only) in this epic.

## 8. Decision log
| Decision | Value | Source |
| --- | --- | --- |
| Approach | Design-first, then phased build | user |
| Scene connections | Auto sequential chain (order = sequence) | user |
| Animation (v1) | Per-scene transition + duration; no keyframes | user |
| Imagery | Approved catalog assets only (no generative) | prior epic (Contract 1) |
| Source of truth | Pure serialisable design model; canvas is a view | AC9 / Contract 4 |

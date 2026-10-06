# Vision & backlog — Scene engine for the Design Studio + agentic harness

**Date:** 2026-10-06 · **Status:** direction doc (not yet a governed charter). Source: user's
"structured advertisement representation" architecture essay + an evaluation of the current build.

## The reframe

Don't position this as "a Canva clone that has AI." Position it as **a structured advertisement
representation (the Scene model) with a Canva-like editor and an agentic engine as clients of the
same model.** We are already ~70% of the way to this: we have a scene-as-document model, three
renderers over it, and an AI that edits via semantic operations rather than raw JSON.

Target architecture: `Workspace → Brand → Asset Library → Templates → Campaign → Scenes → Outputs
(per-format)`, with the **Scene model + its operation set as the one contract** binding the editor,
the renderers, persistence, and the AI.

## Where we are (built / partial / missing)

| Essay concept | Status | Evidence in repo |
|---|---|---|
| Scene-as-document as the core object | **built** | `DesignDoc` with `scenes[]`, elements, per-scene duration/transition; stored as `design` JSON on `Composition`/Project (`apps/web/lib/studio/ops.ts`, `apps/api/app/models/composition.py`) |
| Semantic ops for AI (not raw JSON) | **built** | `lib/studio/ops.ts` ops + Builder `place`/`write-copy` ops via `applyBuilderOps` (`apps/web/components/studio/BuilderPanel.tsx`, `/builder/design`) |
| Same scene → multiple renderers | **built** | Fabric editor (`StudioCanvas`), PNG (client) + PDF (server), MP4 (ffmpeg xfade + drawtext + TTS, render service) |
| Asset library, AI-accessible | **built** | catalog entries→items (text/image/video) in MinIO; `/me/library` (local+AI); **collections** (saved refs); hybrid retrieval + embeddings (`apps/api/app/services/retrieval.py`, AC44) |
| JSON as serialization (not the abstraction) | **partial** | `DesignDoc` type + `migrateDesign`, but no formal documented Scene DSL contract |
| Multi-level agents (asset/copy/scene/campaign/optim) | **partial** | scene=Builder, copy/plan=Creative Plan IR, discovery=Assistant; **campaign + optimization agents missing** |
| Templates as parameterized programs | **weak** | `DesignTemplate` is format + metadata only — no design JSON, no `{{slots}}` |
| Brand / design system | **partial** | `BrandKit` (logo/colors/contact) + PersonalizePanel; no typography/spacing/treatment system or brand-constraint enforcement |
| Timeline / motion as declarative intent | **partial** | storyboard scenes + transitions exist; animation isn't an intent (`confetti`/`fade`) the renderer resolves |
| **Constraint / responsive layout** | **missing** | absolute x/y/width only — one aspect ratio per design |
| **Campaign = scenes → many formats** | **missing** | project=scenes; no campaign→(1:1 / 9:16 / 16:9 / 1.91:1) fan-out |
| **Design versioning (undo/redo/branch, AI-reversible)** | **missing for the design** | we version *content* (`content_version`, project `item_versions` staleness) but not the `design` doc |

## What's left to build (ranked backlog)

- [ ] **1. Constraint-based layout** (highest leverage, hardest to retrofit). Add anchors / %
  sizing (`{anchor, width:"60%", top:"20%", maxWidth}`) to the scene model, keep absolute as a
  fallback; teach the Fabric editor + PDF + MP4 renderers to resolve constraints. Do this BEFORE
  the model + stored designs ossify (migration cost grows).
- [ ] **2. Formal Scene DSL + operation contract.** Write the model (viewport, elements, layout,
  styles, animations, timeline, transitions) + op set (CREATE/UPDATE/DELETE/MOVE/RESIZE/STYLE/
  ANIMATE/GROUP/DUPLICATE) as a governed spec that the UI, renderers, persistence and AI all bind
  to. We have this informally; formalizing is cheap now.
- [ ] **3. Design versioning.** Each save / AI edit produces a new design version (undo / redo /
  compare / fork / restore). Makes AI edits reversible = user trust. Small, high value.
- [ ] **4. Format variants from one scene.** Render the same (constraint-laid-out) scene at N
  aspect ratios without rebuilding. Depends on #1.
- [ ] **5. Campaign abstraction.** `Workspace → Brand → Campaign → Scenes → Outputs`. A campaign is
  the composition of scenes; "one brief → many formats" is a transform. Depends on #1/#4.
- [ ] **6. Agentic levels + optimization loop.** Extend the single Builder into: a **campaign
  agent** (draft N scenes + transitions) and an **optimization/eval agent** (render → inspect →
  revise → return ranked variants; "is the CTA readable? is text overflowing?"). Reuses the render
  service + grounded-plan validation. This is the differentiator beyond Canva.
- [ ] **7. Templates → parameterized scene programs.** A template carries a real scene with
  `{{product}}/{{headline}}/{{price}}/{{cta}}` slots + a preview, not just a format string.
- [ ] **8. Brand/design system as constraints.** Typography, spacing, button styles, image
  treatment, animation rules the agents design *within* (and can be checked against).
- [ ] **9. Richer asset metadata + embeddings.** OCR, detected objects, dominant colors, semantic
  tags, orientation/quality — so retrieval is "blue running shoe, isolated background, portrait,"
  not filenames. Extends existing hybrid retrieval.
- [ ] **10. Declarative animation intent.** `{type:"animation", animation:"confetti", intensity}`
  in the scene; the renderer decides sprites/CSS/WebGL/particles. Sprites stay an implementation
  detail, never exposed to the AI/scene model.

## Recommended sequencing (each its own charter + ACs)
1. **Foundation:** #2 Scene DSL contract + #3 versioning (docs + light refactor; low risk).
2. **Big bet:** #1 constraint layout + #4 format variants (do early).
3. **Compose:** #5 Campaign layer.
4. **Differentiate:** #6 agent levels + optimization loop; #7 parameterized templates.
5. **Deepen:** #8 brand-as-constraints, #9 asset embeddings, #10 animation intent.

## Caveats
- We're past greenfield — the real risk is **retrofitting constraint layout onto absolute-coord
  designs already in the DB**; #1 soon avoids a painful migration.
- The essay's "don't start with the UI" has sailed; its durable point still holds — **the Scene
  model is the contract; editor / renderers / AI are clients.**
- This is a multi-increment program, not one PoC feature. Convert each backlog item into a charter
  + ACs via the compound loop.

# Requirements Charter — Declarative entity model + animation, video & sprite entities

**Date:** 2026-10-05 · **Version:** 1.0.0 · **Status:** for confirmation
**Epic:** Make the studio an AI-authorable declarative document — scenes of typed entities — plus
scene animation, embedded video, and sprite animation; and fix the current studio interaction bugs.
**Branch:** `feat/content-hub-poc` (local only)

## Vision (from the user)

A design is a **declarative JSON document the AI can author directly**:

- A **document** is an ordered **array of scenes**. A video is many scenes; a still image is a
  one-scene array.
- A **scene** is an array of **entities** plus its background, duration and transition.
- An **entity** has a **type** (text · image · shape · video · sprite · …), a **position/size** on
  the scene, an optional **animation**, and type-specific **content sourced from a server URL**
  (an approved, visible catalog asset — never arbitrary egress).

This is a generalisation of today's scene/node model (`apps/web/lib/studio/ops.ts`): nodes *are*
entities; we extend them with `video` + `sprite` types and an `animation` field, and keep the
serialisable, deterministic, pure-ops shape so the Builder/LLM can emit and mutate it as JSON.

## Scope decisions

| # | Decision | Value | Reason | Provenance |
| --- | --- | --- | --- | --- |
| D1 | Document shape | Ordered `scenes[]`; each scene an `entities[]` + background/duration/transition | The user's model; a still = one-scene doc | `[explicit]` |
| D2 | Entity types | text · image · shape · **video** · **sprite** | Current types + the two requested | `[explicit]` |
| D3 | Entity shape | `{ id, type, x, y, width, height, rotation?, animation?, …type-specific }` | One clean, LLM-authorable JSON per entity | `[explicit]` |
| D4 | Entity media source | An **approved catalog media item** OR the **agent's own upload** (image/video); served from the server; provenance recorded | User: uploads or catalog | `[explicit]` |
| D5 | Animation engine | **Declarative presets** on an entity: `{ preset, delayMs, durationMs, easing }` (none·fade-in·slide-in-{left,up}·zoom-in·pulse·ken-burns), rendered via **ffmpeg time-expressions** | Lightest, deterministic, LLM-friendly; frame-raster/Lottie deferred | `[explicit]` (declarative JSON) + `[inferred]` (ffmpeg path) |
| D6 | Embedded video | A `video` entity plays a catalog/upload video for its scene; muted in v1 (no audio-mix) | Audio-mix out of PoC scope | `[explicit]` (source) + `[inferred]` (muted) |
| D7 | Sprite animation | A `sprite` entity plays frames from a sprite-sheet asset: `{ src, frames, cols, rows, fps }`, looped for the scene | User asked to include it | `[explicit]` |
| D8 | Catalog re-model | The catalog is **re-modelled so the media items (images/videos) it carries are first-class**, each with its own metadata + per-item visibility, browsable/selectable by agents and settable by providers | User: full catalog rebuild | `[explicit]` |
| D9 | Uploads | Agents can upload their **own images and videos** (type/size validated, stored server-side), usable as entity media alongside catalog items | User: uploads images+videos | `[explicit]` |
| D10 | Contract 1 | Catalog media still flows to agents only when approved/visible; agent uploads are the agent's own content | Brand-safety boundary preserved | `[requirement]` |
| D11 | Canvas fidelity | Video/sprite render as **static placeholders** on the editing canvas; full motion only in the rendered MP4 | Keeps the PoC canvas simple + deterministic | `[inferred]` |
| D12 | Determinism | Pure ops + injectable ffmpeg/subprocess; tests assert JSON + argv/filtergraph **shape**, never a real encode | Contract 4 | `[requirement]` |
| D13 | Backward compatibility | Existing designs + catalog entries migrate; nothing already green breaks | Don't break saved projects / prior ACs | `[inferred]` |

## Increment plan (sequenced; check-in ⏸ G after each)

This is a large epic. It ships as increments, top-priority / foundational first, with a human
check-in between. The acceptance checklist below is grouped per increment; **each `/oneshot-poc:run`
loop targets the active increment only.**

1. **Increment 1 — Studio interaction & theming fixes (AC48).** Small, unblocks daily use (the canvas
   is currently hard to navigate). **Active now.**
2. **Increment 2 — Catalog re-model (media items first-class) + agent uploads.** Foundational for
   the picker. (New ACs, promoted when it starts.)
3. **Increment 3 — Declarative entity model + studio media picker (catalog items + uploads).**
   Depends on Increment 2.
4. **Increment 4 — Entity-aware animation + video/sprite render.** Depends on Increment 3.

AC49 (entity model) and AC50 (entity render) below are the design targets for Increments 3–4 and are
promoted/refined when those increments begin; they are recorded here so the vision stays whole.

## Acceptance checklist (the contract)

### AC48 — Studio interaction & theming fixes  *(Increment 1 — active)*
- **AC48.1** The zoom/fit control no longer sits under the bottom-right Q/A assistant button — it is
  moved clear of it.
- **AC48.2** **Panning works by left-dragging empty canvas** (plus space/middle-drag), and the
  **wheel zooms to the cursor** (mouse wheel and trackpad pinch); moving around + zoom work.
- **AC48.3** Selected-item text is **readable in light theme** (theme-aware tokens, not a light-on-light
  state) — and dark theme stays correct.
- **AC48.4** The dot-matrix **spacing is floored** so zooming out to see 2–3 frames no longer clouds
  the dots.
- **AC48.5** Entities on the active scene can be **selected, moved, resized, and deleted** on the
  canvas (Delete/Backspace removes the selection; guarded against input focus / inline text edit).
- Proof: a studio-interaction e2e (drag pans → viewport changes; wheel zooms → dot scale changes;
  zoom control's box clears the assistant button; select + Delete removes an entity) + a `deleteNode`
  unit test + existing studio/storyboard e2e stay green.

### AC49 — Declarative entity model (AI-authorable)
- **AC49.1** A scene carries `entities[]`; an entity is
  `{ id, type: "text"|"image"|"shape"|"video"|"sprite", x, y, width, height, rotation?, animation?, …type-specific }`,
  with `image/video/sprite` sources being server catalog-asset URLs + `catalogItemId` provenance.
- **AC49.2** New **pure, deterministic** ops add/update the new entity types and set an entity's
  **animation** (`{preset, delayMs, durationMs, easing}`, preset validated); same inputs → same output.
- **AC49.3** `migrateDesign` loads legacy designs unchanged and fills entity/animation defaults; a
  still-image doc is a one-scene document. Existing AC8/AC9/AC12/AC18 stay green.
- **AC49.4** The studio can place a **video** and a **sprite** entity (from approved catalog assets),
  shown as static placeholders on the canvas; an entity's animation is editable.
- Proof: vitest over the model/ops/migration; studio e2e places a video + sprite entity.

### AC50 — Entity-aware render (animation, video, sprite) from approved content
- **AC50.1** The video render composites a scene's entities in order, honouring each entity's
  **animation preset** via deterministic ffmpeg time-expressions (position/opacity/zoom over `t`,
  `enable='between(...)'`).
- **AC50.2** A **video** entity plays its catalog video for the scene (clamped to the scene
  duration); a **sprite** entity cycles its sheet frames at its fps.
- **AC50.3** All entity media resolve **only to visible catalog entries** server-side (Contract 1);
  hidden/expired/off-limits sources are dropped, never embedded.
- **AC50.4** Deterministic: pytest asserts the per-entity filtergraph/argv shape (overlay/drawtext
  timing, animation expressions, sprite frame-cycling, video trim) without encoding; same inputs →
  same script. Graceful 503 when ffmpeg is unavailable.
- Proof: pytest over the entity render; a Playwright run drives the editor → video with an animated
  entity.

## Out of scope (scope guard)
Frame-rasterization / Lottie engines · external (non-catalog) video URLs · embedded-video audio
mixing (muted in v1) · full in-canvas motion preview (static placeholders; motion in the MP4) ·
per-keyframe hand animation (fixed preset vocabulary) · 3D / physics · **design-level undo/history
for entity edits + delete** (in-memory authoring state, not catalog data — Contract 3 applies to
published/catalog actions; deferred to a later increment).

## Governance
On approval: promote **AC48–AC50** to `/REQUIREMENTS.md` (v2.12.0 + change-log) and
`requirements.manifest.yaml`; `make verify` is the gate.

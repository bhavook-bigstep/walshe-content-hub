# Requirements charter — Nested group editor with sequenced animation (Design Studio)

**Version:** 1.0 · **Date:** 2026-10-09 · **Branch:** `feat/studio-nested-groups` (stacked on `feat/studio-group-panel`, which is off `dev`)
**Design doc:** `/Users/mac/.claude/plans/ethereal-nibbling-swing.md`

Provenance tags: `[explicit]` user said it · `[A2]` confirmed in scope QA · `[requirement]` stated in the brief · `[inferred]` concluded from the codebase.

## Decisions

| # | Decision | Why | Provenance |
|---|----------|-----|------------|
| D1 | Group editing uses a sprite-edit-style left-side tree: top = outermost "parent" group entry, then nested sub-groups + elements indented. | Mirror the sprite chain UX the user pointed to. | [explicit] |
| D2 | Selecting the group row edits group-level props; selecting an element row edits that element via the existing Inspector anim controls. | Per-element animation/transition editing. | [explicit] |
| D3 | "Transition for each element" = the element's entrance preset + start/duration/easing + emphasis loop (NOT scene transitions). | Transitions are scene-to-scene in this app; the per-element analog is the entrance/easing. | [A2] |
| D4 | Arbitrary-depth nesting of groups. | User asked to "tackle nested behaviour." | [explicit][A2] |
| D5 | Strict parent-first sequencing: a child stays hidden during its parent group's entrance, then plays after it finishes (recursively for deeper nesting). | "Parent group's animation always runs first, then the child's behaviour prevails." | [explicit][A2] |
| D6 | Implement sequencing by BAKING per-member start offsets into keyframes at author time (via `enterTrack`), not by changing the engine; grow scene `durationMs` to fit. | Engine is group-blind; preview + MP4 both consume keyframes — baking keeps them in lockstep automatically and avoids truncation. | [inferred][explicit] |
| D7 | Scene-level group registry (`Scene.groups: {id,parentId?,name?,anim?}[]`); node `groupId` = innermost group; `migrateDesign` carries the registry so it round-trips. | Nesting + per-group animation need a home that survives save/load. | [inferred] |
| D8 | Unify: fold the existing GroupPanel group-level controls into the new tree editor (one cohesive panel). | Cleaner UX than two panels. | [A2] |
| D9 | Fix the round-trip bug: group + element properties stay visible after closing/reopening the editor (and after save/reload). | Prior complaint. | [explicit] |
| D10 | Acceptance = unit tests (recompose/nesting/sequencing ops) + web typecheck + a headless studio smoke asserting baked keyframe start-offsets; user verifies MP4 look at ⏸G. | Proportionate POC bar. | [A2] |
| D11 | Version control: PDF fix and group-panel work already committed to their own branches; this feature on `feat/studio-nested-groups`; never push/PR unattended. | Keep change-sets separable; don't lose pending work. | [A2] |

## Acceptance checklist (the contract Phase F verifies)

| # | Requirement | In scope |
|---|-------------|----------|
| AC1 | Selecting a group shows the tree: outermost group entry at top, nested sub-groups + elements below, arbitrary depth. | yes |
| AC2 | Group row → group-level controls (group/ungroup, colour, opacity, duplicate, delete, entrance type+duration+easing, emphasis loop). Element row → Inspector anim controls. | yes |
| AC3 | Grouping a sub-selection inside a group creates a nested child group (`parentId`); ungroup reparents children; arbitrary depth. | yes |
| AC4 | Strict parent-first timing: each node's baked entrance start = Σ ancestor-group entrance durations above its chosen layer; child hidden until then. | yes |
| AC5 | Sequencing is baked into keyframes (engine unchanged); scene `durationMs` grows so late children aren't truncated; preview == export. | yes |
| AC6 | Round-trip: group + element animation/properties persist after closing/reopening the editor and after save→reload (`migrateDesign` carries `Scene.groups`). | yes |
| AC7 | Unified panel folds in the group-level controls. | yes |
| AC8 | All existing studio tests stay green; pending PDF + group-panel work not reverted. | yes |

## Non-goals
Per-element scene transitions; drag-to-reorder in the tree; group-level custom keyframe dope-sheets (group animation = entrance preset + loop; elements keep their own dope-sheet).

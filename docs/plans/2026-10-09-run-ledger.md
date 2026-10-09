# Run ledger — Nested group editor with sequenced animation

Durable state for this `/oneshot-poc:run`. Every phase reads this first and appends when done.
Content-free: status + decisions only, never secrets/PII.

- **Charter:** `docs/plans/2026-10-09-requirements-charter.md`  ·  **Branch:** `feat/studio-nested-groups`
- **Current phase:** `D` (implement done → review next)  ·  **Plan:** `docs/plans/2026-10-09-nested-groups-plan.md`
- **Outer loop:** `0/3`  ·  **Inner loop:** `1/2`

## Requirement status (the acceptance checklist)

| # | Requirement | Status | Evidence / note |
|---|-------------|--------|-----------------|
| AC1 | Group tree: parent entry + nested sub-groups/elements, arbitrary depth | met (unit+ui) | `ops.ts` helpers `groupRegistry/groupAncestry/groupDepth/groupSubtreeIds`; test `group-sequencing · tree_shape_depth`; `GroupTreePanel.tsx` renders outermost→subtree indented by depth |
| AC2 | Group row → group controls; element row → Inspector anim controls | met (unit+ui) | `setGroupAnim` writes registry (test `group_anim_writes_registry`) + stamps members; element path = existing Inspector via `onSelectNode` (page wiring); custom element track untouched (test `element_level_anim_untouched_by_recompose`) |
| AC3 | Nested grouping (parentId) + ungroup reparent, arbitrary depth | met (unit) | `groupNodes` auto-nests sub-selection; `nestGroup` (cycle-rejecting); `ungroupNodes` reparents; test `nest_subselection_and_ungroup_reparents` |
| AC4 | Strict parent-first baked start-offsets | met (unit) | `recomposeSceneGroups` startDelay=Σ ancestor enterMs; static-child hold guard; tests `strict_parent_first_offsets`, `static_child_holds_hidden_during_ancestor_entrance` |
| AC5 | Baked into keyframes; scene grows; preview == export | met (unit) | bake via `enterTrack`; `durationMs` grows (clamped) — test `bakes_into_keyframes_and_grows_scene`; idempotent `recompose_is_idempotent`; chain-skip `skips_chain_members`; samplers untouched ⇒ preview==export by construction |
| AC6 | Round-trip persists (editor reopen + save/reload) | met (unit) | `migrateDesign` carries `Scene.groups` + `isSceneGroup` guard + dangling-parent prune; `cloneDesign` carries groups; load path (`migrateDesign→resolveSprites→resolveImages`, all `...scene`) + save (`toWorkspaceIn` embeds full scenes) preserve it; tests `round_trips_registry`, `migrate_drops_malformed_and_prunes_dangling_parent` |
| AC7 | Unified panel folds in group controls | met (ui) | single `GroupTreePanel` replaces `GroupPanel` (deleted); folded control contract `lib/studio/group-controls.ts` + test `unified_group_controls_contract` |
| AC8 | Existing studio tests green; pending work not reverted | met | full web suite 198/198 green (incl. `grouping.test.ts`, `studio-ops.test.ts` migrate cases); `groups` optional; `web-typecheck` clean; prior PDF + group-panel commits untouched |

## Iteration log

| When (phase) | What changed | Result |
|--------------|--------------|--------|
| A2 | scope QA confirmed: strict parent-first, arbitrary nesting, reuse element anim controls, unify panel, commit-pending-first, unit+headless acceptance | charter v1.0 |
| pre-B | committed pending PDF fix (`fix/pdf-export-fidelity` dc867a6) + group-panel (`feat/studio-group-panel` 50cfbf3); branched `feat/studio-nested-groups` | done |
| B (brainstorm) | brainstormed 3 timing mechanisms for AC4/AC5 — A: bake start-offsets into keyframes at author time (recompose, engine unchanged); B: thin runtime offset at sample time; C: first-class nested-timeline engine. All cited. Chose **A** (preview==export free, reuses sprite-chain pattern, pure/serializable, matches D6). Doc: `docs/brainstorms/2026-10-09-nested-group-sequencing.md` | chose A |
| C (plan) | wrote concrete plan for AC1–AC8 against verified code seams: §1 `Scene.groups`+`SceneGroup`+`GroupAnim` (optional ⇒ AC8-safe); §2 pure hierarchy helpers (ancestry/depth/subtree); §3 `recomposeSceneGroups` (bake Σ ancestor enterMs via existing `enterTrack`, grow via `clampSceneDuration`, idempotent, skips chain members); §4 nesting-aware group ops (parentId/nest/ungroup-reparent); §5 `migrateDesign` carries registry (AC6); §6 unified `GroupTreePanel` absorbing `GroupPanel`, element rows reuse existing Inspector; §8 per-AC vitest matrix (`group-sequencing.test.ts`). Samplers untouched ⇒ preview==export by construction. Open: 15s `MAX_SCENE_DURATION_MS` cap may truncate very deep nesting (surface at ⏸G; plan assumes accept). Doc: `docs/plans/2026-10-09-nested-groups-plan.md` | plan ready → implement |
| D (implement) | **ops.ts:** added `GroupAnim`/`SceneGroup` types + `Scene.groups?` (optional); `cloneDesign` carries groups; `DEFAULT_GROUP_ENTER_MS`; pure helpers `groupRegistry/groupAncestry/groupDepth/groupSubtreeIds/nodeGroupChain`; `recomposeSceneGroups`+`recomposeGroups` (bake parent-first offsets, static-child hold guard, grow+clamp, idempotent, skip chain members); made `groupNodes` auto-nest sub-selections + register; new `nestGroup` (cycle-safe) + `renameGroup`; `ungroupNodes` reparents + prunes registry; `setGroupAnim` writes registry + optional duration/easing + skips chain members; `updateGroupStyle/deleteGroup/duplicateGroup` operate over whole subtree (duplicate clones descendant groups w/ remapped parentId); `migrateDesign` carries+sanitises `groups` (`isSceneGroup`, dangling-parent prune). **UI:** new `GroupTreePanel.tsx` (tree + folded controls) replaces + deletes `GroupPanel.tsx`; `page.tsx` rewired (removed old group handlers/state, added `clearSelection`/`selectSingleNode`). **New:** `lib/studio/group-controls.ts` (AC7 contract). **Tests:** `tests/group-sequencing.test.ts` (15 tests, AC1–AC8). Gates: `web-typecheck` clean; `vitest run` 198/198 green. (Web-only change; api-test/e2e/matrix gates need infra, not run here.) | implement done → review |

## Open assumptions / deferrals
- Non-goals per charter: per-element scene transitions, drag-reorder, group dope-sheet.
- `feat/studio-nested-groups` is stacked on `feat/studio-group-panel` (needs its GroupPanel + duplicateGroup/deleteGroup foundation).
- [C] `MAX_SCENE_DURATION_MS`=15000 (ops.ts:39): very deep nesting whose summed entrances exceed ~14.7s will clamp+truncate the deepest child (same ceiling sprite chains already live under). Plan assumes **accept** the cap; surface to user at ⏸G — raise the cap only if they want deeper sequences.
- [C] Static child of an animated parent gets a baked hold-hidden guard keyframe so strict parent-first holds even without its own entrance (AI-generated idea; follows anim.ts:61 pts[0]-hold behaviour).

## Blockers (if STUCK)
- (none)

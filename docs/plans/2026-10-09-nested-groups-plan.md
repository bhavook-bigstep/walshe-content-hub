# Implementation plan — Nested group editor with sequenced animation (Design Studio)

**Version:** 1.0 · **Date:** 2026-10-09 · **Branch:** `feat/studio-nested-groups`
**Charter:** `docs/plans/2026-10-09-requirements-charter.md` (AC1–AC8) ·
**Brainstorm:** `docs/brainstorms/2026-10-09-nested-group-sequencing.md` (chose **Approach A** — bake
start-offsets into keyframes; cited there) · **Run ledger:** `docs/plans/2026-10-09-run-ledger.md`

**Sourcing.** Everything below is grounded in this repo's own code/contracts (cited as `path:line`,
exempt per `.claude/rules/citations.md`). The one novel, contestable claim — resolve parent-first
timing by baking cumulative offsets into keyframes and growing the scene — is cited in the
brainstorm (CSS-Tricks staggered-animation + the in-repo sprite-chain precedent). Where I introduce
a non-obvious design choice with no external source, it carries the verbatim disclaimer.

---

## 0. Current state (what exists, verified)

| Thing | Where | Note |
|---|---|---|
| `DesignNode.groupId` (flat tag, "no nested groups") | `apps/web/lib/studio/ops.ts:150-151` | becomes **innermost** group id |
| `Scene` interface (no `groups`) | `ops.ts:224-233` | add `groups?` registry |
| `DesignDoc` | `ops.ts:253-259` | unchanged |
| flat group ops: `groupNodes`/`ungroupNodes`/`setGroupAnim`/`updateGroupStyle`/`duplicateGroup`/`deleteGroup`/`groupMemberIds` | `ops.ts:1158-1258` | extend for `parentId` + recompose |
| `enterTrack(node,type,startMs,durationMs,ease)` | `ops.ts:1114-1140` | **already** supports an arbitrary start — the baking primitive |
| `clampSceneDuration` (cap **15000ms**) + `extendSceneForChain` pattern | `ops.ts:295-298, 712-717` | the "grow scene to fit" precedent |
| `syncChainStarts` (pure, idempotent cascade) | `ops.ts:814-860` | the idempotency pattern to copy |
| `migrateDesign` (rebuilds scenes field-by-field, **drops unknown fields**) | `ops.ts:1316-1358` | must explicitly carry `groups` |
| engine `nodeStateAt` — holds `pts[0]` before first keyframe ⇒ **opacity 0 ⇒ hidden** before a delayed entrance | `anim.ts:52-75, 188-215` | gives "child hidden until start" for free |
| preview sampler `previewAt` (reads keyframes + `chainSegments`) | `StudioCanvas.tsx:342-385` | unchanged by Approach A |
| export sampler `renderSceneFrames` (reads keyframes + `chainSegments`) | `frames.ts:38-57` | unchanged by Approach A — preview==export holds |
| flat `GroupPanel` (entrance/emphasis/colour/opacity/duplicate/delete, read-back `GroupState`) | `components/studio/GroupPanel.tsx` | fold into the tree panel |
| per-element Inspector anim (entrance type·start·dur·easing + loop, via `enterTrack`+`setNodeAnim`) | `components/studio/Inspector.tsx:59-100` | reused verbatim for element rows |
| page wiring: `selectedGroupId`, group handlers, `groupState`, panel render | `app/agent/studio/page.tsx:780-830, 1471-1487` | rework for tree + nesting |
| sprite-chain vertical card panel (the tree-UX precedent, D1) | `components/studio/SpriteChainPanel.tsx` | structural model for the tree |
| **existing green tests to preserve (AC8)** | `apps/web/tests/grouping.test.ts`, `studio-ops.test.ts`, `studio-export.test.ts`, `studio-entry-text.test.ts`, `studio-moderation.test.ts`, `studio-keys.test.ts` | must stay green |
| verify gate | `Makefile:16` → `web-typecheck` + `web-test` (vitest, `pnpm exec vitest run`) | acceptance runner |

Confirmed absent: no `Scene.groups`, no `parentId`, no `recomposeSceneGroups` anywhere.

---

## 1. Data model (D7) — foundation for AC1/AC3/AC6

**File:** `apps/web/lib/studio/ops.ts`

1a. New type, exported, above `Scene`:
```ts
export interface GroupAnim {
  enter?: EnterType;            // entrance preset for the whole group
  durationMs?: number;          // entrance duration (default 600); drives children's start offset
  ease?: Easing;
  loop?: NodeAnimation["loop"]; // emphasis loop
}
export interface SceneGroup {
  readonly id: string;          // "group-N" (existing scheme, ops.ts:1172)
  parentId?: string;            // enclosing group id; undefined = top-level group
  name?: string;                // display label in the tree
  anim?: GroupAnim;             // group-level entrance + loop (authoring intent)
}
```
1b. Extend `Scene` (`ops.ts:224-233`): add `groups?: SceneGroup[];` (optional ⇒ old scenes/tests
that omit it stay valid — protects AC8).
1c. Keep `DesignNode.groupId` as the **innermost** group id (reword the comment at `ops.ts:150`).
Ancestry is read from the registry (`SceneGroup.parentId`), never from the node.

**Why a registry, not `parentId` on the node:** a node belongs to exactly one innermost group, but
the *nesting* is between groups; storing it on the group keeps node records flat and lets an empty
intermediate group exist. (Charter D7.)

---

## 2. Hierarchy helpers (pure) — AC3/AC4

**File:** `apps/web/lib/studio/ops.ts` (new pure functions, unit-tested directly)

- `groupRegistry(scene): Map<string, SceneGroup>` — index by id; tolerant of a missing `groups`.
- `groupAncestry(scene, groupId): SceneGroup[]` — innermost→outermost, **cycle-safe** (bounded by
  `groups.length`, mirroring `chainIds` cycle guard at `ops.ts:739-760`).
- `groupDepth(scene, groupId): number` — ancestry length (for tree indentation, AC1).
- `groupSubtreeIds(scene, groupId): string[]` — the group + all descendant group ids (for
  delete/duplicate/ungroup reparent).
- `nodeGroupChain(scene, node): SceneGroup[]` — ancestry of the node's innermost group.

**Why:** AC4's offset is "Σ ancestor-group entrance durations above its chosen layer" — a pure walk
of `parentId`. Keeping it as small pure helpers makes AC4 unit-testable without the engine/UI and
keeps every capability JSON-serializable (memory: `studio-json-serializable-for-mcp`).

---

## 3. The timing core: `recomposeSceneGroups` (D6) — AC4/AC5

**File:** `apps/web/lib/studio/ops.ts` (new exported pure fn + a design-level wrapper)

```ts
export const DEFAULT_GROUP_ENTER_MS = 600;
export function recomposeSceneGroups(scene: Scene): Scene;      // pure, idempotent
export function recomposeGroups(design: DesignDoc): DesignDoc;  // maps every scene; no-op clone-free when no groups
```

**Algorithm (per scene):**
1. Build `groupRegistry` + an `enterMs(groupId)` lookup = `group.anim?.durationMs ?? DEFAULT_GROUP_ENTER_MS`
   when the group has an entrance, else `0`.
2. For each node with a `groupId` present in the registry:
   - `startDelay = Σ enterMs(a.id)` over `groupAncestry(node.innermostGroup)` **excluding the node's
     own innermost group** (ancestors "above the chosen layer" — matches AC4 wording; the node plays
     *after* its parent chain, concurrently with its own group's entrance).
   - Read the node's **author-relative own start** from `node.anim?.enter?.startMs` **minus any
     previously-baked delay** → store the author value in `node.anim.enter.startMs` only; never read
     back a baked `t`. (Idempotency, see §3a.)
   - Choose the entrance: element's own `anim.enter.type` if set, else the innermost group's
     `anim.enter` (group entrance applied to members, as `setGroupAnim` does today at `ops.ts:1202`).
   - If an entrance exists: `node.anim = { ...enterTrack(node, type, startDelay + ownStart, dur, ease),
     enter: { type, startMs: ownStart, durationMs: dur, ease }, loop }` — **the baked keyframe `t`
     carries `startDelay`; the stored `enter.startMs` stays author-relative.**
   - If no entrance but `startDelay > 0` (static child of an animated parent): bake a **hold-hidden
     guard** `{ keyframes: [{t:0,opacity:0},{t:startDelay,opacity:0},{t:startDelay,opacity: base}] }`
     so a static element still stays hidden during ancestor entrances (strict parent-first, D5). No
     external source — **No source found — this is an AI-generated idea.** (It is a direct
     consequence of `anim.ts:61` holding `pts[0]`, i.e. opacity 0 before the track.)
3. Grow duration: `scene.durationMs = clampSceneDuration(Math.max(scene.durationMs, latestChildEndMs + 300))`
   — same "+300 tail then clamp" shape as `extendSceneForChain` (`ops.ts:715`).

**3a. Idempotency (the accepted trade-off).** Re-running recompose must not re-add the delay. Rule:
`enter.startMs` is the **single source of author intent** and is always author-relative; the baked
`t` offset lives only in `keyframes` and is fully recomputed from the registry each run — never read
back. A dedicated test asserts `recompose(recompose(x)) === recompose(x)` structurally. This mirrors
`syncChainStarts` (`ops.ts:808-860`), which is documented idempotent.

**3b. Sprite-chain coexistence (guard).** A node with `successorId` is already timed by
`chainSegments` (`anim.ts:142-170`); recompose must **skip** baking a group delay onto chain members
to avoid double offset. Guard: `if (node.successorId || isChainMember) continue;`. Covered by a test.

**3c. Known limitation (flag for ⏸G verify).** `clampSceneDuration` caps at 15000ms
(`ops.ts:39,297`). Deep nesting whose summed entrances exceed ~14.7s will clamp and the deepest
child can truncate — the same ceiling the sprite chain already lives under. **Decision for the user
at the verify gate:** accept the 15s ceiling (PoC-appropriate, consistent with chains) vs. raise
`MAX_SCENE_DURATION_MS`. Plan assumes **accept**; noted as an open assumption in the ledger.

---

## 4. Group ops become nesting-aware + auto-recompose — AC3

**File:** `apps/web/lib/studio/ops.ts` (extend existing fns at `1158-1258`)

- `groupNodes(design, sceneIndex, nodeIds)` → also append a `SceneGroup{id}` to `scene.groups`. If
  every selected node already shares one innermost group `P`, set the new group's `parentId = P`
  (nesting a sub-selection, AC3). Call `recomposeGroups` before return.
- **New** `nestGroup(design, sceneIndex, childGroupId, parentGroupId)` — set
  `childGroup.parentId = parentGroupId` (reject cycles via `groupAncestry`); recompose. (Explicit
  "group a sub-selection inside a group" path for the tree.)
- `ungroupNodes(design, sceneIndex, groupId)` → **reparent**: children groups whose `parentId ===
  groupId` get `parentId = removed.parentId`; member nodes' `groupId` set to `removed.parentId`
  (or deleted if top-level); remove the `SceneGroup`; recompose. (AC3 reparent, arbitrary depth.)
- `setGroupAnim(design, sceneIndex, groupId, enter, loop)` → write to `SceneGroup.anim` (registry),
  **not** per-member stamping; recompose bakes it onto members. Keeps the group's intent in one
  place so it round-trips (AC6) and nested timing recomputes.
- `updateGroupStyle` / `deleteGroup` / `duplicateGroup` → operate over `groupSubtreeIds` (whole
  subtree), keep registry in sync (duplicate clones descendant `SceneGroup`s with fresh ids +
  remapped `parentId`), then recompose.
- New `renameGroup(design, sceneIndex, groupId, name)` → `SceneGroup.name` (tree label, AC2).

Every mutation returns through `recomposeGroups` so baked keyframes + duration never go stale.

---

## 5. Round-trip (D9) — AC6

**File:** `apps/web/lib/studio/ops.ts` `migrateDesign` (`1316-1358`)

- In the `scenes.map`, carry the registry: read `page.groups`, validate each entry
  (`id: string`, optional `parentId: string`, `name?`, `anim?` via a small `isSceneGroup` guard
  mirroring `isDesignNode` at `ops.ts:1360-1370`), drop malformed entries, and set
  `groups: validGroups.length ? validGroups : undefined`.
- Prune dangling `parentId`s (parent no longer present) to top-level — defensive against hand-edited
  JSON (same spirit as the scene-id dedupe at `ops.ts:1341-1344`).
- `scenesAsPages` (`ops.ts:1302-1308`, the server export shape) already emits `nodes`+`background`
  only; baked keyframes live on nodes, so PDF/MP4 export carries the sequencing unchanged — no edit
  needed there.

**Why this is the whole AC6 fix:** `migrateDesign` drops unknown fields (`ops.ts:1335` only keeps
`isDesignNode` nodes; scene fields are explicit). The round-trip bug is purely "the registry wasn't
carried"; carrying it + recompose-on-load makes group *and* element props survive reopen/save/reload.

---

## 6. UI: unified tree panel (D1/D2/D8) — AC1/AC2/AC7

**New file:** `apps/web/components/studio/GroupTreePanel.tsx`
**Edit:** `apps/web/app/agent/studio/page.tsx` (panel wiring `780-830`, render `1471-1487`);
**delete/absorb:** `components/studio/GroupPanel.tsx` (its controls move into the tree's group-row
detail; keep `GroupState` read-back idea).

- **Tree render (AC1):** outermost group row at top; nested sub-groups + element rows indented by
  `groupDepth` (same vertical-card idiom as `SpriteChainPanel.tsx`). Build the view model from
  `scene.groups` + member nodes; a selected group shows its whole subtree.
- **Row selection (AC2):**
  - *Group row selected* → render the folded group controls (group/ungroup/nest, colour, opacity,
    duplicate, delete, entrance type+duration+easing, emphasis loop) — the old `GroupPanel` body,
    now writing through the §4 ops. Values read back from `SceneGroup.anim`/first member (the
    `GroupState` pattern, keeps props visible after reopen — AC6/AC2).
  - *Element row selected* → set `selected`/`selectedIds` to that node so the **existing Inspector**
    (`Inspector.tsx:59-100`) renders its per-element anim controls unchanged (D2 — "reuse element
    anim controls"). No new element-anim UI.
- **AC7 (unify):** one panel; no separate `GroupPanel` floating box. The render guard becomes
  "selection resolves to a group OR 2+ items" → show `GroupTreePanel`; single loose element → the
  Inspector as today.
- Page handlers (`groupSelected`/`ungroupSelected`/`groupAnim`/…, `page.tsx:786-816`) rewire to the
  nesting-aware ops; add `onNest`, `onRename`, and `onSelectRow(nodeId|groupId)`.

No engine/sampler/export changes — Approach A keeps `StudioCanvas.previewAt` and `frames.ts`
untouched, so **preview == export** by construction (AC5, Contract 4).

---

## 7. Dependency graph (build order)

```
  §1 types (Scene.groups, SceneGroup, GroupAnim)
        │
        ├─► §2 hierarchy helpers ──┐
        │                          ▼
        │                    §3 recomposeSceneGroups / recomposeGroups  ◄── enterTrack (exists)
        │                          │
        ├─► §5 migrateDesign carry │
        │                          ▼
        └─────────────────► §4 nesting-aware group ops (call recompose)
                                   │
                                   ▼
                             §6 GroupTreePanel + page wiring  (pure-layer must be green first)
                                   │
                                   ▼
                             §8 tests per AC  ──►  make verify (web-typecheck + web-test) = Phase F
```
Critical path: **§1 → §2 → §3** (everything else depends on recompose). §5 and §4 are parallel once
§3 lands. §6 is last (UI over a proven pure layer). AC8 regression check runs continuously.

---

## 8. Test matrix — one (or more) test per acceptance item

Runner: **vitest** (`pnpm exec vitest run`, `Makefile:46`). Synthetic fixtures only; pure ops →
deterministic/hermetic (Contract 4; `.claude/rules/testing.md`). New file
`apps/web/tests/group-sequencing.test.ts` (+ additions to `grouping.test.ts`).

| AC | Test (file · name) | Asserts |
|----|--------------------|---------|
| **AC1** | `group-sequencing · tree_shape_depth` | `groupAncestry`/`groupDepth` on a 3-level fixture give innermost→outermost order + correct depths; `groupSubtreeIds` returns the full subtree. |
| **AC2** | `group-sequencing · group_anim_writes_registry` + reuse `grouping · setGroupAnim` | `setGroupAnim` writes `SceneGroup.anim`; recompose stamps members; element path unchanged (Inspector uses existing `enterTrack`+`setNodeAnim`, already covered). |
| **AC3** | `grouping · nest_subselection` / `ungroup_reparents` | grouping a sub-selection sets child `parentId`; `ungroupNodes` reparents descendant groups + member `groupId` to the removed group's parent; arbitrary depth; cycle rejected by `nestGroup`. |
| **AC4** | `group-sequencing · strict_parent_first_offsets` | on nested fixture (parent enter 600, child enter 600), child's baked first-keyframe `t === 600`, grandchild `=== 1200`; child opacity via `nodeStateAt(child, t<600)===0` (hidden until parent done). |
| **AC5** | `group-sequencing · bakes_into_keyframes_and_grows_scene` + `preview_equals_export` | baked keyframes present (engine unread of `groups`); `scene.durationMs` grew to cover latest child +300 (clamped ≤15000); `nodeStateAt` at sampled t matches what `renderSceneFrames`/`previewAt` would read (same fn) — assert the shared `nodeStateAt` output at frame times equals the baked expectation. |
| **AC5-idem** | `group-sequencing · recompose_is_idempotent` | `recompose(recompose(d))` deep-equals `recompose(d)`; `enter.startMs` stays author-relative across runs (the §3a trade-off guard). |
| **AC5-chain** | `group-sequencing · skips_chain_members` | a group member with `successorId` gets **no** extra baked delay (no double offset vs `chainSegments`). |
| **AC6** | `group-sequencing · round_trips_registry` | `migrateDesign(scenesAsStored(d))` preserves `Scene.groups`, `parentId`, `anim`, and baked member keyframes; malformed group entry dropped; dangling `parentId` pruned to top-level. |
| **AC7** | (component-level, light) `group-sequencing · unified_controls_contract` | pure assertion that the group-row control set = entrance+duration+easing+loop+colour+opacity+dup+delete+group/ungroup/nest (the folded contract), driven off a shared constant the panel imports — guards the "one panel" contract without a DOM runner. |
| **AC8** | run full suite | `grouping.test.ts`, `studio-ops.test.ts` (incl. existing `migrateDesign` cases `255-293`), `studio-export.test.ts`, etc. all green; `Scene.groups` optional so pre-existing fixtures still typecheck; confirm PDF/group-panel commits untouched (`git log`). |

Headless smoke (D10): AC4+AC5 tests above *are* the "baked keyframe start-offset" assertion the
charter asked for, at the pure-op layer (no browser needed; `frames.ts`/`previewAt` both consume the
same `nodeStateAt`, so asserting it once covers both). User verifies MP4 look at ⏸G.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Recompose drifts on repeated edits | author-relative `enter.startMs` is the only intent store; baked `t` always recomputed; idempotency test (§8 AC5-idem). |
| preview ≠ export | Approach A touches neither sampler; both read baked keyframes via shared `nodeStateAt` — structural guarantee (brainstorm §4). |
| Chain + group double-offset | recompose skips `successorId` members; test AC5-chain. |
| Deep nesting truncates at 15s cap | known limitation §3c; decision surfaced at ⏸G; consistent with sprite chains. |
| Migration drops registry → AC6 regress | explicit carry + `isSceneGroup` guard + round-trip test. |
| Breaking existing flat-group tests (AC8) | `groups` optional; flat behaviour = registry with no `parentId`; keep `grouping.test.ts` green as the gate. |

## 10. Non-goals (charter)
Per-element *scene* transitions; drag-to-reorder in the tree; group-level custom dope-sheets. Group
animation = entrance preset + loop; elements keep their own dope-sheet.

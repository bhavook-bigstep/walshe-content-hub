import { describe, expect, it } from "vitest";
import { nodeStateAt } from "../lib/studio/anim";
import {
  DEFAULT_GROUP_ENTER_MS,
  MAX_SCENE_DURATION_MS,
  MIN_SCENE_DURATION_MS,
  addShape,
  addSuccessorSprite,
  addText,
  deleteGroup,
  duplicateGroup,
  groupAncestry,
  groupDepth,
  groupNodes,
  groupSubtreeIds,
  migrateDesign,
  newDesign,
  recomposeGroups,
  renameGroup,
  scenesAsPages,
  setGroupAnim,
  setNodeAnim,
  setSceneDuration,
  ungroupNodes,
  updateGroupStyle,
  type DesignDoc,
  type Scene,
} from "../lib/studio/ops";

// AC1–AC8 — Nested group editor with strict parent-first sequenced animation. The timing is BAKED
// into keyframes at author time (Approach A / D6), so the engine stays group-blind and the canvas
// preview == MP4 export by construction. Pure ops → deterministic + hermetic (Contract 4).
// Proof node-id: `apps/web/tests/group-sequencing.test.ts::test_nested_group_sequencing`.

/** Build a 3-level nested fixture using only public ops: top group P ⊃ child C ⊃ grandchild G.
 * Membership: `a` ∈ P, `b` ∈ C, `cc` & `dd` ∈ G. Built by grouping successive sub-selections. */
function nested3(): { d: DesignDoc; p: string; c: string; g: string; a: string; b: string; cc: string; dd: string } {
  let d = newDesign("social");
  d = addText(d, 0, "A", { x: 10, y: 10 });
  d = addShape(d, 0, "rect", { x: 100, y: 120 });
  d = addText(d, 0, "C", { x: 200, y: 200 });
  d = addText(d, 0, "D", { x: 300, y: 300 });
  const [a, b, cc, dd] = d.scenes[0].nodes.map((n) => n.id);
  // Group all four → P (top-level).
  d = groupNodes(d, 0, [a, b, cc, dd]);
  const p = d.scenes[0].nodes.find((n) => n.id === a)!.groupId!;
  // Sub-selection {b, cc, dd} all share P → nested child C inside P.
  d = groupNodes(d, 0, [b, cc, dd]);
  const c = d.scenes[0].nodes.find((n) => n.id === b)!.groupId!;
  // Sub-selection {cc, dd} all share C → grandchild G inside C.
  d = groupNodes(d, 0, [cc, dd]);
  const g = d.scenes[0].nodes.find((n) => n.id === cc)!.groupId!;
  return { d, p, c, g, a, b, cc, dd };
}

/** Round-trip through the stored JSON shape (what persistence reads back). */
function roundTrip(d: DesignDoc): DesignDoc {
  return migrateDesign(JSON.parse(JSON.stringify(d)))!;
}

describe("nested group sequencing", () => {
  it("test_nested_group_sequencing_tree_shape_depth", () => {
    // AC1 — the tree: ancestry innermost→outermost, correct depths, full subtree.
    const { d, p, c, g } = nested3();
    const scene = d.scenes[0];

    expect(groupAncestry(scene, g).map((x) => x.id)).toEqual([g, c, p]);
    expect(groupAncestry(scene, c).map((x) => x.id)).toEqual([c, p]);
    expect(groupAncestry(scene, p).map((x) => x.id)).toEqual([p]);

    expect(groupDepth(scene, p)).toBe(1);
    expect(groupDepth(scene, c)).toBe(2);
    expect(groupDepth(scene, g)).toBe(3);

    // Subtree from the root is the whole tree; from a leaf group it's just itself.
    expect(new Set(groupSubtreeIds(scene, p))).toEqual(new Set([p, c, g]));
    expect(groupSubtreeIds(scene, g)).toEqual([g]);
  });

  it("test_group_anim_writes_registry", () => {
    // AC2 — group-level animation is recorded on the registry (so it round-trips + drives nesting).
    const { d, p } = nested3();
    const animated = setGroupAnim(d, 0, p, "rise", { type: "pulse", periodMs: 1200 });
    const grp = animated.scenes[0].groups!.find((x) => x.id === p)!;
    expect(grp.anim?.enter).toBe("rise");
    expect(grp.anim?.durationMs).toBe(DEFAULT_GROUP_ENTER_MS);
    expect(grp.anim?.loop).toEqual({ type: "pulse", periodMs: 1200 });
  });

  it("test_nest_subselection_and_ungroup_reparents", () => {
    // AC3 — grouping a sub-selection nests (parentId); ungroup reparents children + members up a level.
    const { d, p, c, g, a, b, cc } = nested3();
    let scene = d.scenes[0];
    // Child C's parent is P; grandchild G's parent is C (set by grouping sub-selections).
    expect(scene.groups!.find((x) => x.id === c)!.parentId).toBe(p);
    expect(scene.groups!.find((x) => x.id === g)!.parentId).toBe(c);

    // Ungroup the middle group C: its grandchild group G reparents to P, and C's direct member `b`
    // reparents to P. G's member cc stays in G (unchanged innermost).
    const after = ungroupNodes(d, 0, c);
    scene = after.scenes[0];
    expect(scene.groups!.find((x) => x.id === c)).toBeUndefined(); // C removed
    expect(scene.groups!.find((x) => x.id === g)!.parentId).toBe(p); // G reparented up
    expect(scene.nodes.find((n) => n.id === b)!.groupId).toBe(p); // b lifted to P
    expect(scene.nodes.find((n) => n.id === cc)!.groupId).toBe(g); // cc still in G
    expect(scene.nodes.find((n) => n.id === a)!.groupId).toBe(p); // a untouched
  });

  it("test_strict_parent_first_offsets", () => {
    // AC4 — each node's baked entrance start = Σ ancestor-group entrance durations; children hidden
    // until then. Give all three groups a 600ms rise entrance.
    let { d, p, c, g, a, b, cc } = nested3();
    d = setGroupAnim(d, 0, p, "rise", undefined);
    d = setGroupAnim(d, 0, c, "rise", undefined);
    d = setGroupAnim(d, 0, g, "rise", undefined);
    const scene = d.scenes[0];
    const na = scene.nodes.find((n) => n.id === a)!; // in P → delay 0
    const nb = scene.nodes.find((n) => n.id === b)!; // in C (parent P) → delay 600
    const ng = scene.nodes.find((n) => n.id === cc)!; // in G (parents C,P) → delay 1200

    const firstT = (node: typeof na) => Math.min(...node.anim!.keyframes.map((k) => k.t));
    expect(firstT(na)).toBe(0);
    expect(firstT(nb)).toBe(600);
    expect(firstT(ng)).toBe(1200);

    // The child stays HIDDEN (opacity 0) until its parent group has finished entering.
    expect(nodeStateAt(nb, 300).opacity).toBe(0); // during P's entrance
    expect(nodeStateAt(nb, 599).opacity).toBeLessThan(0.5);
    expect(nodeStateAt(ng, 1000).opacity).toBe(0); // during C's entrance
    expect(nodeStateAt(ng, 1300).opacity).toBeGreaterThan(0); // after
  });

  it("test_group_arrival_timestamp_offsets_members", () => {
    // A group has its own arrival/appearance timestamp — WHEN the whole group appears. That delay
    // adds to every descendant's baked start, on top of strict parent-first.
    let { d, p, c, a, b } = nested3();
    d = setGroupAnim(d, 0, p, "rise", undefined, { startMs: 500 }); // P appears at 500ms
    d = setGroupAnim(d, 0, c, "rise", undefined); // C: default arrival 0
    const grp = d.scenes[0].groups!.find((x) => x.id === p)!;
    expect(grp.anim?.startMs).toBe(500);

    const scene = d.scenes[0];
    const firstT = (id: string) =>
      Math.min(...scene.nodes.find((n) => n.id === id)!.anim!.keyframes.map((k) => k.t));
    expect(firstT(a)).toBe(500); // in P → delayed by P's arrival
    expect(firstT(b)).toBe(500 + DEFAULT_GROUP_ENTER_MS); // in C → P.arrival + P.entrance

    // The arrival timestamp round-trips through persistence.
    expect(roundTrip(d).scenes[0].groups!.find((x) => x.id === p)!.anim?.startMs).toBe(500);
  });

  it("test_group_appears_late_with_no_entrance", () => {
    // Arrival-only: a group can simply appear late with no entrance preset — its members hold hidden
    // until the timestamp, then show.
    const { d, p, a } = nested3();
    const x = setGroupAnim(d, 0, p, null, undefined, { startMs: 800 });
    expect(x.scenes[0].groups!.find((g) => g.id === p)!.anim?.startMs).toBe(800);
    const na = x.scenes[0].nodes.find((n) => n.id === a)!;
    expect(nodeStateAt(na, 400).opacity).toBe(0); // hidden before it appears
    expect(nodeStateAt(na, 900).opacity).toBeGreaterThan(0); // visible after
  });

  it("test_static_child_holds_hidden_during_ancestor_entrance", () => {
    // AC4/D5 — a STATIC child (no own entrance) of an animated parent still stays hidden until the
    // parent's entrance finishes (baked hold-hidden guard).
    const { d, p, c, b } = nested3();
    let x = setGroupAnim(d, 0, p, "rise", undefined); // P animates; C/its members stay static
    // Remove any entrance C stamped on b by clearing C's anim (b becomes a static child of P via C).
    x = setGroupAnim(x, 0, c, null, undefined);
    const nb = x.scenes[0].nodes.find((n) => n.id === b)!;
    // b is in C whose ancestor P has a 600ms entrance → hidden until 600, then visible.
    expect(nodeStateAt(nb, 100).opacity).toBe(0);
    expect(nodeStateAt(nb, 700).opacity).toBeGreaterThan(0);
  });

  it("test_bakes_into_keyframes_and_grows_scene", () => {
    // AC5 — sequencing is in the keyframes (engine never reads `groups`); the scene grows to fit the
    // last child; the clamp ceiling is respected.
    let { d, p, c, g } = nested3();
    d = setGroupAnim(d, 0, p, "rise", undefined);
    d = setGroupAnim(d, 0, c, "rise", undefined);
    d = setGroupAnim(d, 0, g, "rise", undefined);

    // Shrink the scene below the baked timeline, then recompose: it must GROW to cover the last child
    // (ends at 1200 + 600 = 1800) plus a 300ms tail, clamped to the max.
    d = setSceneDuration(d, d.scenes[0].id, MIN_SCENE_DURATION_MS);
    d = recomposeGroups(d);
    const scene = d.scenes[0];
    expect(scene.durationMs).toBe(2100);
    expect(scene.durationMs).toBeLessThanOrEqual(MAX_SCENE_DURATION_MS);

    // The export shape (what PDF/MP4 consume) carries the baked keyframes on the nodes.
    const pages = scenesAsPages(d) as { pages: { nodes: { anim?: { keyframes: { t: number }[] } }[] }[] };
    const anyBaked = pages.pages[0].nodes.some((n) => (n.anim?.keyframes.length ?? 0) > 0);
    expect(anyBaked).toBe(true);
  });

  it("test_recompose_is_idempotent", () => {
    // AC5-idem — re-running recompose must not re-add the ancestor delay. enter.startMs stays
    // author-relative; the baked `t` is recomputed, never read back.
    let { d, p, c, g } = nested3();
    d = setGroupAnim(d, 0, p, "rise", undefined);
    d = setGroupAnim(d, 0, c, "rise", undefined);
    d = setGroupAnim(d, 0, g, "rise", undefined);
    const once = recomposeGroups(d);
    const twice = recomposeGroups(once);
    expect(twice).toEqual(once);
    // Author-relative start is preserved (0), while the baked keyframe carries the offset.
    for (const n of once.scenes[0].nodes) {
      if (n.anim?.enter) expect(n.anim.enter.startMs).toBe(0);
    }
  });

  it("test_skips_chain_members", () => {
    // AC5-chain — a sprite-chain member inside a group gets NO extra baked group delay (its timing is
    // owned by chainSegments; a double offset would desync preview/export).
    let d = newDesign("social");
    // Two sprites (frame filmstrips) + a plain text, all grouped, with the sprite chained.
    d = {
      ...d,
      scenes: d.scenes.map((s, i) =>
        i === 0
          ? {
              ...s,
              nodes: [
                { id: "image-s-n1", type: "image", x: 0, y: 0, width: 40, height: 40, src: "f0", frames: ["f0", "f1"], fps: 10 },
                { id: "text-s-n2", type: "text", x: 0, y: 0, width: 40, height: 40, text: "T" },
              ],
            }
          : s,
      ),
    } as DesignDoc;
    d = addSuccessorSprite(d, 0, "image-s-n1", { frames: ["g0", "g1"], fps: 10, width: 40, height: 40 });
    // Group the head sprite + the text under a nested structure with an animated parent.
    const headId = "image-s-n1";
    const succId = d.scenes[0].nodes.find((n) => n.id !== headId && n.type === "image")!.id;
    d = groupNodes(d, 0, [headId, "text-s-n2"]);
    const outer = d.scenes[0].nodes.find((n) => n.id === headId)!.groupId!;
    // Give the group an entrance that WOULD offset/animate its members — the chain head (a member)
    // must be left to the chain timeline, so it gets no baked group entrance.
    d = setGroupAnim(d, 0, outer, "rise", undefined);
    const head = d.scenes[0].nodes.find((n) => n.id === headId)!;
    const succ = d.scenes[0].nodes.find((n) => n.id === succId)!;
    expect(head.anim?.enter).toBeUndefined();
    expect(succ.anim?.enter).toBeUndefined();
    // The non-chain member (text) still receives the group entrance.
    const text = d.scenes[0].nodes.find((n) => n.id === "text-s-n2")!;
    expect(text.anim?.enter?.type).toBe("rise");
  });

  it("test_round_trips_registry", () => {
    // AC6 — Scene.groups (ids, parentId, anim) and the baked member keyframes survive save→reload.
    let { d, p, c, g } = nested3();
    d = setGroupAnim(d, 0, p, "rise", { type: "pulse", periodMs: 1000 });
    d = setGroupAnim(d, 0, c, "fade", undefined);
    d = renameGroup(d, 0, p, "Hero block");

    const reloaded = roundTrip(d);
    const scene = reloaded.scenes[0];
    expect(scene.groups!.find((x) => x.id === p)!.name).toBe("Hero block");
    expect(scene.groups!.find((x) => x.id === p)!.anim?.enter).toBe("rise");
    expect(scene.groups!.find((x) => x.id === c)!.parentId).toBe(p);
    expect(scene.groups!.find((x) => x.id === g)!.parentId).toBe(c);
    // Baked keyframes on members persist (the engine reads these, not the registry).
    const beforeKfs = d.scenes[0].nodes.map((n) => n.anim?.keyframes.length ?? 0);
    const afterKfs = scene.nodes.map((n) => n.anim?.keyframes.length ?? 0);
    expect(afterKfs).toEqual(beforeKfs);
  });

  it("test_migrate_drops_malformed_and_prunes_dangling_parent", () => {
    // AC6 — defensive migration: a malformed group entry is dropped; a dangling parentId is pruned.
    const migrated = migrateDesign({
      scenes: [
        {
          id: "scene-n1",
          nodes: [{ id: "n", type: "text", x: 0, y: 0 }],
          groups: [
            { id: "group-1" },
            { id: "group-2", parentId: "group-1" },
            { id: "group-3", parentId: "ghost" }, // dangling parent → lift to top-level
            { parentId: "group-1" }, // malformed (no id) → dropped
            42, // junk → dropped
          ],
        },
      ],
    })!;
    const groups = migrated.scenes[0].groups!;
    expect(groups.map((g) => g.id).sort()).toEqual(["group-1", "group-2", "group-3"]);
    expect(groups.find((g) => g.id === "group-2")!.parentId).toBe("group-1");
    expect(groups.find((g) => g.id === "group-3")!.parentId).toBeUndefined();
  });

  it("test_duplicate_group_clones_whole_subtree", () => {
    // AC2/AC3 — duplicating a group clones its nested sub-groups with fresh ids + remapped parents.
    const { d, p } = nested3();
    const before = d.scenes[0].groups!.length;
    const dup = duplicateGroup(d, 0, p);
    const scene = dup.scenes[0];
    // Three groups cloned (P, C, G) → registry doubled for that subtree.
    expect(scene.groups!.length).toBe(before + 3);
    // The clone is a self-consistent tree: every non-top cloned group's parent exists in the registry.
    const ids = new Set(scene.groups!.map((g) => g.id));
    for (const g of scene.groups!) if (g.parentId) expect(ids.has(g.parentId)).toBe(true);
    // Node ids remain unique after duplication.
    expect(new Set(scene.nodes.map((n) => n.id)).size).toBe(scene.nodes.length);
  });

  it("test_delete_group_removes_subtree", () => {
    // Deleting the root group removes every nested member + registry entry.
    const { d, p } = nested3();
    const pruned = deleteGroup(d, 0, p);
    expect(pruned.scenes[0].nodes.length).toBe(0); // all four nodes were inside the subtree
    expect(pruned.scenes[0].groups).toBeUndefined();
  });

  it("test_element_level_anim_untouched_by_recompose", () => {
    // AC2 (element path) — an element's own custom keyframe track (set via the Inspector/setNodeAnim)
    // is NOT clobbered by recompose when its group has no entrance delay.
    const { d, a } = nested3();
    const custom = { keyframes: [{ t: 0, x: 0, y: 0 }, { t: 500, x: 50, y: 50 }] };
    let x = setNodeAnim(d, 0, a, custom);
    x = recomposeGroups(x);
    const na = x.scenes[0].nodes.find((n) => n.id === a)!;
    expect(na.anim?.keyframes).toEqual(custom.keyframes);
  });

  it("test_grown_scene_clamps_at_ceiling", () => {
    // AC5 (boundary) — when the summed parent-first entrances push the last child past the 15s
    // ceiling, the grown duration is CLAMPED to MAX_SCENE_DURATION_MS (not left to overrun). Three
    // 8s entrances nest so the deepest child ends at 8000(P)+8000(C)+8000(own)=24000ms → clamp.
    let { d, p, c, g } = nested3();
    d = setGroupAnim(d, 0, p, "rise", undefined, { durationMs: 8000 });
    d = setGroupAnim(d, 0, c, "rise", undefined, { durationMs: 8000 });
    d = setGroupAnim(d, 0, g, "rise", undefined, { durationMs: 8000 });
    const scene = recomposeGroups(d).scenes[0];
    // Sanity: the un-clamped timeline really does exceed the ceiling (+300 tail → 24300 > 15000).
    const latestEnd = Math.max(
      ...scene.nodes.map((n) => (n.anim?.keyframes.length ? Math.max(...n.anim.keyframes.map((k) => k.t)) : 0)),
    );
    expect(latestEnd + 300).toBeGreaterThan(MAX_SCENE_DURATION_MS);
    expect(scene.durationMs).toBe(MAX_SCENE_DURATION_MS);
  });

  it("test_set_group_anim_opts_duration_easing_and_min_guard", () => {
    // AC7 (entrance duration + easing controls) — opts.durationMs/opts.ease are baked onto the
    // registry AND every member's entrance; the Math.max(1, round(...)) guard clamps a 0/negative/
    // fractional duration to a valid minimum (the risk path setGroupAnim's guard protects).
    const { d, p, a } = nested3();
    // Explicit duration + easing are recorded on the registry and the member's baked entrance.
    const styled = setGroupAnim(d, 0, p, "rise", undefined, { durationMs: 900, ease: "bounce" });
    const grp = styled.scenes[0].groups!.find((x) => x.id === p)!;
    expect(grp.anim?.durationMs).toBe(900);
    expect(grp.anim?.ease).toBe("bounce");
    const na = styled.scenes[0].nodes.find((n) => n.id === a)!; // in P (top-level) → no ancestor offset
    expect(na.anim?.enter?.durationMs).toBe(900);
    expect(na.anim?.enter?.ease).toBe("bounce");
    expect(Math.max(...na.anim!.keyframes.map((k) => k.t))).toBe(900); // baked end = 0 + duration
    expect(na.anim!.keyframes.find((k) => k.opacity === 1)!.ease).toBe("bounce"); // easing on the "to" kf

    // Guard: a zero/negative/fractional duration clamps to the >=1 minimum (never 0 or a non-integer).
    for (const bad of [0, -250, 0.4]) {
      const guarded = setGroupAnim(d, 0, p, "rise", undefined, { durationMs: bad });
      expect(guarded.scenes[0].groups!.find((x) => x.id === p)!.anim?.durationMs).toBe(1);
      const gn = guarded.scenes[0].nodes.find((n) => n.id === a)!;
      expect(gn.anim?.enter?.durationMs).toBe(1);
    }
  });

  it("test_update_group_style_patches_nested_subtree", () => {
    // AC7 (colour/opacity controls) — a style patch on the ROOT group reaches members of nested
    // sub-groups (the subtree-wide path), not just the root's direct members.
    const { d, p, a, b, cc, dd } = nested3(); // a∈P, b∈C⊂P, cc&dd∈G⊂C⊂P
    const styled = updateGroupStyle(d, 0, p, { color: "#ff0000", opacity: 0.25 });
    const scene = styled.scenes[0];
    for (const id of [a, b, cc, dd]) {
      const n = scene.nodes.find((x) => x.id === id)!;
      expect(n.color).toBe("#ff0000");
      expect(n.opacity).toBe(0.25);
    }
  });

  it("test_update_group_style_legacy_flat_fallback", () => {
    // AC7 (defensive) — a node tagged with a groupId that has NO registry entry (legacy/hand-edited
    // scene) still gets patched via the `gid === groupId` fallback branch.
    let d = newDesign("social");
    d = addText(d, 0, "Legacy", { x: 0, y: 0 });
    // Tag the node with a group id but leave `scene.groups` absent (no registry).
    d = { ...d, scenes: d.scenes.map((s, i) => (i === 0 ? { ...s, nodes: s.nodes.map((n) => ({ ...n, groupId: "orphan" })) } : s)) };
    const styled = updateGroupStyle(d, 0, "orphan", { color: "#00ff00" });
    expect(styled.scenes[0].nodes[0].color).toBe("#00ff00");
  });

  it("test_group_ancestry_bounded_under_cyclic_registry", () => {
    // AC1 (corruption path) — migrateDesign only prunes DANGLING parentIds, not cycles, so a stored
    // a→b→a parent loop survives save/reload. groupAncestry's seen-set + size bound is then the sole
    // defence: every hierarchy helper must TERMINATE and return bounded output (never loop forever).
    const migrated = migrateDesign({
      scenes: [
        {
          id: "scene-n1",
          nodes: [{ id: "n", type: "text", x: 0, y: 0, groupId: "a" }],
          groups: [
            { id: "a", parentId: "b" },
            { id: "b", parentId: "a" }, // cycle: both parents exist, so neither is pruned
          ],
        },
      ],
    })!;
    const scene: Scene = migrated.scenes[0];
    // The cycle really did survive migration (not pruned).
    expect(scene.groups!.find((g) => g.id === "a")!.parentId).toBe("b");
    expect(scene.groups!.find((g) => g.id === "b")!.parentId).toBe("a");

    // All three helpers terminate and stay bounded by the registry size (no runaway).
    const anc = groupAncestry(scene, "a");
    expect(anc.length).toBeLessThanOrEqual(scene.groups!.length);
    expect(new Set(anc.map((g) => g.id)).size).toBe(anc.length); // no id repeats
    expect(groupDepth(scene, "a")).toBeLessThanOrEqual(scene.groups!.length);
    const sub = groupSubtreeIds(scene, "a");
    expect(sub.length).toBeLessThanOrEqual(scene.groups!.length);
    expect(new Set(sub).size).toBe(sub.length);
    // recompose also terminates over the cyclic scene (uses groupAncestry internally).
    expect(() => recomposeGroups(migrated)).not.toThrow();
  });

  it("test_existing_flat_grouping_contract_preserved", () => {
    // AC8 — a plain top-level group with an entrance behaves exactly as the flat GroupPanel expected:
    // members get the entrance with no offset (startDelay 0).
    let d = newDesign("social");
    d = addText(d, 0, "A", { x: 10, y: 10 });
    d = addText(d, 0, "B", { x: 20, y: 20 });
    const [a, b] = d.scenes[0].nodes.map((n) => n.id);
    d = groupNodes(d, 0, [a, b]);
    const gid = d.scenes[0].nodes.find((n) => n.id === a)!.groupId!;
    d = setGroupAnim(d, 0, gid, "fade", { type: "pulse", periodMs: 1200 });
    for (const id of [a, b]) {
      const n = d.scenes[0].nodes.find((x) => x.id === id)!;
      expect(n.anim?.enter?.type).toBe("fade");
      expect(Math.min(...n.anim!.keyframes.map((k) => k.t))).toBe(0); // no offset at top level
      expect(n.anim?.loop).toEqual({ type: "pulse", periodMs: 1200 });
    }
  });
});

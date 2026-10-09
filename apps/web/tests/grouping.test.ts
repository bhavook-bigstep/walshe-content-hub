import { describe, expect, it } from "vitest";
import {
  addShape,
  addText,
  deleteGroup,
  duplicateGroup,
  groupMemberIds,
  groupNodes,
  newDesign,
  setGroupAnim,
  ungroupNodes,
  updateGroupStyle,
} from "../lib/studio/ops";

// AC82 — Grouping: select 2+ elements, group them under one flat (non-nested) tag, and apply
// movement, animation and shared style to every member together; ungroup releases them.
// Proof node-id: `apps/web/tests/grouping.test.ts::test_group_ops`.
describe("studio grouping ops", () => {
  // A scene with three distinct elements to group.
  function scene3() {
    let d = newDesign("social");
    d = addText(d, 0, "A", { x: 10, y: 10 });
    d = addShape(d, 0, "rect", { x: 100, y: 120 });
    d = addText(d, 0, "B", { x: 200, y: 50 });
    return d;
  }

  it("test_group_ops", () => {
    const d = scene3();
    const [a, , c] = d.scenes[0].nodes.map((n) => n.id);

    // Grouping two of the three nodes tags exactly those with one fresh shared id.
    const grouped = groupNodes(d, 0, [a, c]);
    const gid = grouped.scenes[0].nodes.find((n) => n.id === a)?.groupId;
    expect(gid).toMatch(/^group-\d+$/);
    expect(grouped.scenes[0].nodes.find((n) => n.id === c)?.groupId).toBe(gid);
    expect(groupMemberIds(grouped.scenes[0], gid!)).toEqual([a, c]);
    // The ungrouped node stays untagged.
    const b = grouped.scenes[0].nodes.find((n) => n.id !== a && n.id !== c)!;
    expect(b.groupId).toBeUndefined();

    // Grouping is pure: the original design is untouched.
    expect(d.scenes[0].nodes.some((n) => n.groupId)).toBe(false);
  });

  it("ignores a selection of fewer than two nodes", () => {
    const d = scene3();
    const only = d.scenes[0].nodes[0].id;
    expect(groupNodes(d, 0, [only])).toBe(d); // returned unchanged
  });

  it("re-grouping replaces an existing tag with one fresh id (no nesting)", () => {
    const d = scene3();
    const [a, b, c] = d.scenes[0].nodes.map((n) => n.id);
    const g1 = groupNodes(d, 0, [a, b]);
    const first = g1.scenes[0].nodes.find((n) => n.id === a)!.groupId!;
    // Group a different pair that overlaps the first group — a gets a new, higher id.
    const g2 = groupNodes(g1, 0, [a, c]);
    const second = g2.scenes[0].nodes.find((n) => n.id === a)!.groupId!;
    expect(second).not.toBe(first);
    expect(g2.scenes[0].nodes.find((n) => n.id === c)!.groupId).toBe(second);
    // b keeps the old tag — group membership is a flat tag, never nested.
    expect(g2.scenes[0].nodes.find((n) => n.id === b)!.groupId).toBe(first);
  });

  it("applies an entrance + emphasis loop to every member, anchored at each position", () => {
    const d = scene3();
    const [a, , c] = d.scenes[0].nodes.map((n) => n.id);
    const grouped = groupNodes(d, 0, [a, c]);
    const gid = grouped.scenes[0].nodes.find((n) => n.id === a)!.groupId!;

    const animated = setGroupAnim(grouped, 0, gid, "rise", { type: "pulse", periodMs: 1200 });
    for (const id of [a, c]) {
      const n = animated.scenes[0].nodes.find((x) => x.id === id)!;
      expect(n.anim?.enter?.type).toBe("rise");
      expect(n.anim?.loop).toEqual({ type: "pulse", periodMs: 1200 });
      expect(n.anim?.keyframes.length).toBeGreaterThan(0);
    }
    // The non-member is left without animation.
    const other = animated.scenes[0].nodes.find((n) => n.id !== a && n.id !== c)!;
    expect(other.anim).toBeUndefined();

    // Clearing (no entrance, no loop) removes the animation from every member.
    const cleared = setGroupAnim(animated, 0, gid, null, undefined);
    for (const id of [a, c]) {
      expect(cleared.scenes[0].nodes.find((x) => x.id === id)!.anim).toBeUndefined();
    }
  });

  it("patches a shared style onto every member and ungroups them", () => {
    const d = scene3();
    const [a, , c] = d.scenes[0].nodes.map((n) => n.id);
    const grouped = groupNodes(d, 0, [a, c]);
    const gid = grouped.scenes[0].nodes.find((n) => n.id === a)!.groupId!;

    const dimmed = updateGroupStyle(grouped, 0, gid, { opacity: 0.4 });
    for (const id of [a, c]) {
      expect(dimmed.scenes[0].nodes.find((x) => x.id === id)!.opacity).toBe(0.4);
    }

    const released = ungroupNodes(dimmed, 0, gid);
    expect(released.scenes[0].nodes.every((n) => n.groupId === undefined)).toBe(true);
    // Styling survives ungrouping — only the tag is removed.
    expect(released.scenes[0].nodes.find((n) => n.id === a)!.opacity).toBe(0.4);
  });

  it("duplicates every member as a new group with fresh ids, offset above the originals", () => {
    const d = scene3();
    const [a, , c] = d.scenes[0].nodes.map((n) => n.id);
    const grouped = groupNodes(d, 0, [a, c]);
    const gid = grouped.scenes[0].nodes.find((n) => n.id === a)!.groupId!;

    const dup = duplicateGroup(grouped, 0, gid);
    // Two new nodes added (one per member); originals untouched.
    expect(dup.scenes[0].nodes).toHaveLength(grouped.scenes[0].nodes.length + 2);
    const copies = dup.scenes[0].nodes.filter((n) => n.groupId && n.groupId !== gid);
    expect(copies).toHaveLength(2);
    // The copies share ONE fresh group id, distinct from the source group, with unique ids.
    const newGid = copies[0].groupId!;
    expect(newGid).toMatch(/^group-\d+$/);
    expect(newGid).not.toBe(gid);
    expect(copies.every((n) => n.groupId === newGid)).toBe(true);
    expect(new Set(dup.scenes[0].nodes.map((n) => n.id)).size).toBe(dup.scenes[0].nodes.length);
    // Each copy is offset from a source member by (24, 24).
    const srcA = grouped.scenes[0].nodes.find((n) => n.id === a)!;
    expect(copies.some((n) => n.x === srcA.x + 24 && n.y === srcA.y + 24)).toBe(true);
    // Pure: the original design is unchanged.
    expect(grouped.scenes[0].nodes).toHaveLength(3);
  });

  it("deletes every member of a group, leaving non-members", () => {
    const d = scene3();
    const [a, b, c] = d.scenes[0].nodes.map((n) => n.id);
    const grouped = groupNodes(d, 0, [a, c]);
    const gid = grouped.scenes[0].nodes.find((n) => n.id === a)!.groupId!;

    const pruned = deleteGroup(grouped, 0, gid);
    expect(pruned.scenes[0].nodes.map((n) => n.id)).toEqual([b]);
    // Pure: the original still has all three.
    expect(grouped.scenes[0].nodes).toHaveLength(3);
  });
});

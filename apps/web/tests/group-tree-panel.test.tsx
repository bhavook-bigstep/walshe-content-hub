import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GroupTreePanel from "../components/studio/GroupTreePanel";
import { GROUP_ROW_CONTROLS, type GroupRowControl } from "../lib/studio/group-controls";
import { addShape, addText, groupNodes, newDesign, type DesignDoc } from "../lib/studio/ops";

// AC7 — the unified GroupTreePanel folds in EVERY group-level control the contract promises. This
// renders the real panel to static markup (react-dom/server — no jsdom, stays hermetic + node-env)
// and asserts each control in GROUP_ROW_CONTROLS is actually present, so the constant is a VERIFIED
// single source of truth, not a copy the panel can silently drift from.
// Proof node-id: `apps/web/tests/group-tree-panel.test.tsx::test_panel_renders_every_contract_control`.

/** A loose, ungrouped two-node selection → the panel offers the "Group" action (no shared parent). */
function looseSelection(): { design: DesignDoc; selectedIds: string[] } {
  let d = addText(newDesign("social"), 0, "A", { x: 0, y: 0 });
  d = addText(d, 0, "B", { x: 40, y: 40 });
  return { design: d, selectedIds: d.scenes[0].nodes.map((n) => n.id) };
}

/** A sub-selection that already shares one group → the panel offers "Nest … as sub-group" AND, with
 * the group active, shows the full folded control set (rename/entrance/colour/opacity/…). */
function nestedSelection(): { design: DesignDoc; selectedIds: string[] } {
  let d = addText(newDesign("social"), 0, "A", { x: 0, y: 0 });
  d = addShape(d, 0, "rect", { x: 100, y: 100 });
  d = addText(d, 0, "C", { x: 200, y: 200 });
  const ids = d.scenes[0].nodes.map((n) => n.id);
  d = groupNodes(d, 0, ids); // P over all three
  d = groupNodes(d, 0, [ids[1], ids[2]]); // nested child C ⊂ P over the sub-selection
  return { design: d, selectedIds: [ids[1], ids[2]] };
}

function render(sel: { design: DesignDoc; selectedIds: string[] }): string {
  return renderToStaticMarkup(
    <GroupTreePanel
      design={sel.design}
      sceneIndex={0}
      selectedIds={sel.selectedIds}
      onChange={() => {}}
      onSelectNode={() => {}}
      onClearSelection={() => {}}
    />,
  );
}

// How each contracted control proves it rendered: an aria-label (inputs/selects) or button text.
const PRESENT: Record<GroupRowControl, (html: string) => boolean> = {
  group: (h) => h.includes("Group 2 items"),
  nest: (h) => h.includes("Nest 2 as sub-group"),
  ungroup: (h) => />Ungroup</.test(h),
  rename: (h) => h.includes('aria-label="Group name"'),
  "entrance-type": (h) => h.includes('aria-label="Group entrance animation"'),
  "entrance-duration": (h) => h.includes('aria-label="Group entrance duration"'),
  "entrance-easing": (h) => h.includes('aria-label="Group entrance easing"'),
  "emphasis-loop": (h) => h.includes('aria-label="Group emphasis loop"'),
  colour: (h) => h.includes('aria-label="Group colour"'),
  opacity: (h) => h.includes('aria-label="Group opacity"'),
  duplicate: (h) => />Duplicate</.test(h),
  delete: (h) => />Delete</.test(h),
};

describe("GroupTreePanel control contract", () => {
  it("test_panel_renders_every_contract_control", () => {
    // "group" is only offered for a LOOSE selection; "nest" + the folded editor for a grouped one.
    // Their union must cover the whole contract — so the panel genuinely exposes each control.
    const html = render(looseSelection()) + "\n" + render(nestedSelection());
    for (const control of GROUP_ROW_CONTROLS) {
      expect(PRESENT[control], `control "${control}" must render in the panel`).toBeTruthy();
      expect(PRESENT[control](html), `control "${control}" not found in rendered panel`).toBe(true);
    }
  });

  it("test_contract_matcher_covers_exactly_the_controls", () => {
    // Guard against drift the other way: every matcher key is a real contract control (no stale keys).
    expect(Object.keys(PRESENT).sort()).toEqual([...GROUP_ROW_CONTROLS].sort());
  });
});

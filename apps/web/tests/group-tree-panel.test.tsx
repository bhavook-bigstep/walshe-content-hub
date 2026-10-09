import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GroupTreePanel from "../components/studio/GroupTreePanel";
import GroupControls from "../components/studio/GroupControls";
import { GROUP_ROW_CONTROLS, type GroupRowControl } from "../lib/studio/group-controls";
import { addShape, addText, groupNodes, newDesign, type DesignDoc } from "../lib/studio/ops";

// AC7 — the unified group UI exposes EVERY group-level control the contract promises. The tree panel
// (navigation + the group/nest action) and the GroupControls body (the folded editor shown IN the
// Edit-element window) together cover the contract. Rendered to static markup (react-dom/server — no
// jsdom, stays hermetic + node-env) so the constant is a VERIFIED single source of truth.
// Proof node-id: `apps/web/tests/group-tree-panel.test.tsx::test_panel_renders_every_contract_control`.

/** A loose, ungrouped two-node selection → the tree offers the "Group" action. */
function looseSelection(): { design: DesignDoc; selectedIds: string[] } {
  let d = addText(newDesign("social"), 0, "A", { x: 0, y: 0 });
  d = addText(d, 0, "B", { x: 40, y: 40 });
  return { design: d, selectedIds: d.scenes[0].nodes.map((n) => n.id) };
}

/** A sub-selection that already shares one group → the tree offers "Nest … as sub-group"; the group's
 * folded controls render in GroupControls. */
function nestedSelection(): { design: DesignDoc; selectedIds: string[]; groupId: string } {
  let d = addText(newDesign("social"), 0, "A", { x: 0, y: 0 });
  d = addShape(d, 0, "rect", { x: 100, y: 100 });
  d = addText(d, 0, "C", { x: 200, y: 200 });
  const ids = d.scenes[0].nodes.map((n) => n.id);
  d = groupNodes(d, 0, ids); // P over all three
  d = groupNodes(d, 0, [ids[1], ids[2]]); // nested child over the sub-selection
  const groupId = d.scenes[0].nodes.find((n) => n.id === ids[1])!.groupId!;
  return { design: d, selectedIds: [ids[1], ids[2]], groupId };
}

function renderTree(sel: { design: DesignDoc; selectedIds: string[] }): string {
  return renderToStaticMarkup(
    <GroupTreePanel
      design={sel.design}
      sceneIndex={0}
      selectedIds={sel.selectedIds}
      activeGroupId={null}
      onChange={() => {}}
      onSelectNode={() => {}}
      onSelectGroup={() => {}}
    />,
  );
}

function renderControls(design: DesignDoc, groupId: string): string {
  return renderToStaticMarkup(
    <GroupControls design={design} sceneIndex={0} groupId={groupId} onChange={() => {}} onDeleted={() => {}} />,
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

describe("unified group control contract", () => {
  it("test_panel_renders_every_contract_control", () => {
    const nested = nestedSelection();
    // tree: "group" (loose) + "nest" (grouped); GroupControls: the folded editor. Their union must
    // cover the whole contract — so the UI genuinely exposes each control.
    const html =
      renderTree(looseSelection()) + "\n" + renderTree(nested) + "\n" + renderControls(nested.design, nested.groupId);
    for (const control of GROUP_ROW_CONTROLS) {
      expect(PRESENT[control], `control "${control}" must render`).toBeTruthy();
      expect(PRESENT[control](html), `control "${control}" not found`).toBe(true);
    }
  });

  it("test_contract_matcher_covers_exactly_the_controls", () => {
    expect(Object.keys(PRESENT).sort()).toEqual([...GROUP_ROW_CONTROLS].sort());
  });
});

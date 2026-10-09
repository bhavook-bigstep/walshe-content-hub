"use client";

import { useMemo } from "react";
import {
  groupAncestry,
  groupDepth,
  groupDescendantNodeIds,
  groupNodes,
  groupRegistry,
  type DesignDoc,
  type DesignNode,
  type SceneGroup,
} from "../../lib/studio/ops";

const label = "text-[11px] font-semibold uppercase tracking-wide text-walshe-grey";

/** A short, friendly label for an element row. */
function nodeLabel(n: DesignNode): string {
  if (n.type === "text") return n.text?.trim() ? `“${n.text.slice(0, 18)}”` : "Text";
  if (n.type === "shape") return n.shape === "line" || n.points ? "Curve" : n.shape ? `${n.shape[0].toUpperCase()}${n.shape.slice(1)}` : "Shape";
  if (n.type === "image") return n.placeholder ? "Media frame" : n.videoSrc || n.videoKey ? "Video" : (n.frames?.length ?? 0) > 1 || n.sprite ? "Sprite" : "Image";
  return n.type;
}

/**
 * The structure tree (AC1/AC7) — a drawer on the Edit-element window's left edge. It is navigation
 * ONLY: the outermost parent group at the top, nested sub-groups + elements indented (arbitrary
 * depth); an ungrouped element shows as the sole entry so every object reads the same way. Clicking a
 * row hands the active edit target back to the page (element → Inspector, group → GroupControls in the
 * SAME window), so an element and a group are never edited at once. A loose multi-selection offers the
 * group/nest action.
 */
export default function GroupTreePanel({
  design,
  sceneIndex,
  selectedIds,
  selectedNodeId,
  activeGroupId,
  onChange,
  onSelectNode,
  onSelectGroup,
}: {
  design: DesignDoc;
  sceneIndex: number;
  selectedIds: string[];
  /** The single element currently being edited (sole entry when ungrouped; roots the tree otherwise). */
  selectedNodeId?: string;
  /** The group row currently being edited (highlighted); its controls live in the Edit-element window. */
  activeGroupId: string | null;
  onChange: (next: DesignDoc) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectGroup: (groupId: string) => void;
}) {
  const scene = design.scenes[sceneIndex];
  const reg = useMemo(() => (scene ? groupRegistry(scene) : new Map<string, SceneGroup>()), [scene]);
  if (!scene) return null;

  // A loose multi-selection that already shares one parent group → "Nest as sub-group".
  const allShareParent =
    selectedIds.length >= 2 &&
    (() => {
      const gids = selectedIds.map((id) => scene.nodes.find((n) => n.id === id)?.groupId);
      return gids[0] && gids.every((g) => g === gids[0]);
    })();
  const selectionGroupId =
    selectedIds.length >= 2 &&
    (() => {
      const gids = selectedIds.map((id) => scene.nodes.find((n) => n.id === id)?.groupId);
      return gids[0] && gids.every((g) => g === gids[0]) ? gids[0]! : null;
    })();

  // Whole groups wholly inside the selection → grouping nests them as sub-groups (group-of-groups).
  const wholeGroupCount = (() => {
    const sel = new Set(selectedIds);
    const gids = new Set(
      selectedIds.map((id) => scene.nodes.find((n) => n.id === id)?.groupId).filter(Boolean) as string[],
    );
    return [...gids].filter((gid) => {
      const d = groupDescendantNodeIds(scene, gid);
      return d.length > 0 && d.every((id) => sel.has(id));
    }).length;
  })();

  function emitGroup() {
    if (selectedIds.length < 2) return;
    onChange(groupNodes(design, sceneIndex, selectedIds));
  }

  // Root the tree at the active group, else at the edited element's own group. A truly ungrouped
  // element has no group → it shows as the SOLE entry.
  const editedNode = selectedNodeId ? scene.nodes.find((n) => n.id === selectedNodeId) : undefined;
  const contextGroupId = activeGroupId ?? editedNode?.groupId ?? null;
  type Row = { kind: "group"; group: SceneGroup; depth: number } | { kind: "node"; node: DesignNode; depth: number };
  const rows: Row[] = [];
  if (contextGroupId && reg.has(contextGroupId)) {
    const ancestry = groupAncestry(scene, contextGroupId);
    const rootId = ancestry[ancestry.length - 1].id; // outermost
    const visit = (gid: string) => {
      const g = reg.get(gid)!;
      const depth = groupDepth(scene, gid);
      rows.push({ kind: "group", group: g, depth });
      for (const n of scene.nodes) if (n.groupId === gid) rows.push({ kind: "node", node: n, depth: depth + 1 });
      for (const child of reg.values()) if (child.parentId === gid) visit(child.id);
    };
    visit(rootId);
  } else if (editedNode) {
    rows.push({ kind: "node", node: editedNode, depth: 0 }); // sole, ungrouped entry
  }

  return (
    <div className="space-y-2.5">
      <p className={label}>{selectedIds.length > 1 && !selectionGroupId ? `${selectedIds.length} selected` : "Structure"}</p>

      {/* Group / nest a loose selection. */}
      {selectedIds.length >= 2 && (
        <button
          type="button"
          onClick={emitGroup}
          className="w-full rounded-md border border-walshe-teal bg-walshe-teal px-3 py-2 text-small font-semibold text-white transition-colors hover:bg-walshe-teal/90"
        >
          {allShareParent && selectionGroupId
            ? `Nest ${selectedIds.length} as sub-group`
            : wholeGroupCount >= 2
              ? `Group ${wholeGroupCount} groups into one`
              : `Group ${selectedIds.length} items`}
        </button>
      )}

      {/* The tree (navigation only). */}
      {rows.length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto no-scrollbar rounded-md border border-walshe-line/70 bg-walshe-base/60 p-1">
          {rows.map((r) =>
            r.kind === "group" ? (
              <button
                key={`g-${r.group.id}`}
                type="button"
                onClick={() => onSelectGroup(r.group.id)}
                style={{ paddingLeft: 8 + r.depth * 12 }}
                className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-small transition-colors ${
                  r.group.id === activeGroupId ? "bg-walshe-teal/15 font-semibold text-walshe-ink" : "text-walshe-ink hover:bg-walshe-ink/5"
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <span className="truncate">{r.group.name || "Group"}</span>
              </button>
            ) : (
              <button
                key={`n-${r.node.id}`}
                type="button"
                onClick={() => onSelectNode(r.node.id)}
                style={{ paddingLeft: 8 + r.depth * 12 }}
                className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-small transition-colors ${
                  r.node.id === selectedNodeId && !activeGroupId
                    ? "bg-walshe-teal/15 font-semibold text-walshe-ink"
                    : "text-walshe-grey hover:bg-walshe-ink/5 hover:text-walshe-ink"
                }`}
              >
                <span className="text-walshe-line">•</span>
                <span className="truncate">{nodeLabel(r.node)}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

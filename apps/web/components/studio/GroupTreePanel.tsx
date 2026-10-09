"use client";

import { useMemo, useState } from "react";
import {
  EASINGS,
  ENTER_TYPES,
  DEFAULT_GROUP_ENTER_MS,
  deleteGroup,
  duplicateGroup,
  groupAncestry,
  groupDepth,
  groupDescendantNodeIds,
  groupNodes,
  groupParentEntryMs,
  groupRegistry,
  renameGroup,
  setGroupAnim,
  ungroupNodes,
  updateGroupStyle,
  type DesignDoc,
  type DesignNode,
  type Easing,
  type EnterType,
  type SceneGroup,
} from "../../lib/studio/ops";

type GroupLoop = "none" | "pulse" | "bob";

const ENTER_LABEL: Record<EnterType | "none", string> = {
  none: "None",
  fade: "Fade in",
  rise: "Rise up",
  "slide-left": "Slide in ←",
  "slide-right": "Slide in →",
  scale: "Scale up",
};

const EASE_LABEL: Record<Easing, string> = {
  linear: "Linear",
  easeIn: "Ease in",
  easeOut: "Ease out",
  easeInOut: "Ease in-out",
  back: "Back",
  bounce: "Bounce",
};

const row = "flex items-center justify-between gap-2 py-1.5";
const label = "text-[11px] font-semibold uppercase tracking-wide text-walshe-grey";
const field =
  "h-8 rounded-md border border-walshe-line bg-walshe-base px-2 text-small text-walshe-ink focus:border-walshe-mint focus:outline-none";

/** A short, friendly label for an element row. */
function nodeLabel(n: DesignNode): string {
  if (n.type === "text") return n.text?.trim() ? `“${n.text.slice(0, 18)}”` : "Text";
  if (n.type === "shape") return n.shape === "line" || n.points ? "Curve" : n.shape ? `${n.shape[0].toUpperCase()}${n.shape.slice(1)}` : "Shape";
  if (n.type === "image") return n.placeholder ? "Media frame" : n.videoSrc || n.videoKey ? "Video" : (n.frames?.length ?? 0) > 1 || n.sprite ? "Sprite" : "Image";
  return n.type;
}

/**
 * The unified nested-group editor (AC1/AC2/AC7). A left-side tree: the outermost parent group at the
 * top, nested sub-groups + elements indented below (arbitrary depth, D1). Selecting a GROUP row shows
 * the folded group-level controls (entrance type·duration·easing, emphasis loop, colour, opacity,
 * rename, nest, duplicate, delete, group/ungroup); selecting an ELEMENT row hands selection back to
 * the page so the existing Inspector edits that element's own animation (D2). Group timing is BAKED
 * into keyframes by the ops layer (recomposeSceneGroups), so preview == export.
 */
export default function GroupTreePanel({
  design,
  sceneIndex,
  selectedIds,
  onChange,
  onSelectNode,
  onClearSelection,
}: {
  design: DesignDoc;
  sceneIndex: number;
  selectedIds: string[];
  onChange: (next: DesignDoc) => void;
  onSelectNode: (nodeId: string) => void;
  onClearSelection: () => void;
}) {
  const scene = design.scenes[sceneIndex];
  const reg = useMemo(() => (scene ? groupRegistry(scene) : new Map<string, SceneGroup>()), [scene]);

  // The innermost group shared by the WHOLE current selection (null for a loose multi-selection).
  const selectionGroupId = useMemo(() => {
    if (!scene || selectedIds.length < 2) return null;
    const gids = selectedIds.map((id) => scene.nodes.find((n) => n.id === id)?.groupId);
    return gids[0] && gids.every((g) => g === gids[0]) ? gids[0]! : null;
  }, [scene, selectedIds]);

  // The group row the user is inspecting; defaults to the selection's group.
  const [picked, setPicked] = useState<string | null>(null);
  const activeGroupId = picked && reg.has(picked) ? picked : selectionGroupId;

  if (!scene) return null;

  // A loose multi-selection that isn't yet a group → offer to group it (nesting happens automatically
  // when the whole selection already shares one parent group, via groupNodes).
  const allShareParent =
    selectedIds.length >= 2 &&
    (() => {
      const gids = selectedIds.map((id) => scene.nodes.find((n) => n.id === id)?.groupId);
      return gids[0] && gids.every((g) => g === gids[0]);
    })();

  // Whole groups wholly contained in the selection → grouping nests them as sub-groups (each keeps
  // its own behaviour) under a new parent, rather than flattening (group-of-groups).
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

  // ── Tree view model (outermost ancestor → full subtree) ───────────────────────────────────────
  type Row = { kind: "group"; group: SceneGroup; depth: number } | { kind: "node"; node: DesignNode; depth: number };
  const rows: Row[] = [];
  if (activeGroupId && reg.has(activeGroupId)) {
    const ancestry = groupAncestry(scene, activeGroupId);
    const rootId = ancestry[ancestry.length - 1].id; // outermost
    const visit = (gid: string) => {
      const g = reg.get(gid)!;
      const depth = groupDepth(scene, gid);
      rows.push({ kind: "group", group: g, depth });
      for (const n of scene.nodes) if (n.groupId === gid) rows.push({ kind: "node", node: n, depth: depth + 1 });
      for (const child of reg.values()) if (child.parentId === gid) visit(child.id);
    };
    visit(rootId);
  }

  const activeGroup = activeGroupId ? reg.get(activeGroupId) : undefined;
  const firstMember = activeGroupId ? scene.nodes.find((n) => n.groupId === activeGroupId) : undefined;
  const enter: EnterType | "none" = activeGroup?.anim?.enter ?? "none";
  const durationMs = activeGroup?.anim?.durationMs ?? DEFAULT_GROUP_ENTER_MS;
  const ease: Easing = activeGroup?.anim?.ease ?? "easeOut";
  // A child can't appear before its parent's entry time; its own arrival is author-relative on top.
  // The control shows ABSOLUTE scene-time, defaulting to (and clamped at) the parent's entry time.
  const parentEntryMs = activeGroupId ? groupParentEntryMs(scene, activeGroupId) : 0;
  const arrivalRelMs = activeGroup?.anim?.startMs ?? 0; // author-relative (0 = at parent's entry)
  const appearsAtMs = parentEntryMs + arrivalRelMs; // absolute scene-time shown in the control
  const loopType: GroupLoop =
    activeGroup?.anim?.loop?.type === "pulse" || activeGroup?.anim?.loop?.type === "bob"
      ? activeGroup.anim.loop.type
      : "none";
  const color = firstMember?.color ?? "#111111";
  const opacity = Math.round((firstMember?.opacity ?? 1) * 100);

  function emitAnim(next: Partial<{ enter: EnterType | "none"; loop: GroupLoop; durationMs: number; ease: Easing; startMs: number }>) {
    if (!activeGroupId) return;
    const e = next.enter ?? enter;
    const l = next.loop ?? loopType;
    const dur = next.durationMs ?? durationMs;
    const es = next.ease ?? ease;
    const sm = next.startMs ?? arrivalRelMs;
    onChange(
      setGroupAnim(
        design,
        sceneIndex,
        activeGroupId,
        e === "none" ? null : e,
        l === "none" ? undefined : { type: l, periodMs: 1200 },
        { durationMs: dur, ease: es, startMs: sm },
      ),
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className={label}>{activeGroupId ? "Group editor" : `${selectedIds.length} selected`}</p>
        <button
          type="button"
          aria-label="Deselect"
          onClick={onClearSelection}
          className="grid h-7 w-7 place-items-center rounded-md text-walshe-grey transition-colors hover:bg-walshe-ink/10 hover:text-walshe-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

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

      {/* The tree. */}
      {rows.length > 0 && (
        <div className="max-h-56 overflow-y-auto no-scrollbar rounded-md border border-walshe-line/70 bg-walshe-base/60 p-1">
          {rows.map((r) =>
            r.kind === "group" ? (
              <button
                key={`g-${r.group.id}`}
                type="button"
                onClick={() => setPicked(r.group.id)}
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
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-small text-walshe-grey transition-colors hover:bg-walshe-ink/5 hover:text-walshe-ink"
              >
                <span className="text-walshe-line">•</span>
                <span className="truncate">{nodeLabel(r.node)}</span>
              </button>
            ),
          )}
        </div>
      )}

      {/* Group-level controls (the folded GroupPanel). */}
      {activeGroupId && (
        <>
          <div className={row}>
            <span className={label}>Name</span>
            <input
              value={activeGroup?.name ?? ""}
              placeholder="Group"
              onChange={(e) => onChange(renameGroup(design, sceneIndex, activeGroupId, e.target.value))}
              aria-label="Group name"
              className={`${field} w-36`}
            />
          </div>
          <p className="border-t border-walshe-line/70 pt-2.5 text-[11px] text-walshe-grey">
            Applied to every item (children play after the parent):
          </p>
          <div className={row}>
            <span className={label}>Entrance</span>
            <select
              value={enter}
              onChange={(e) => emitAnim({ enter: e.target.value as EnterType | "none" })}
              aria-label="Group entrance animation"
              className={`${field} w-36`}
            >
              {(["none", ...ENTER_TYPES] as (EnterType | "none")[]).map((tp) => (
                <option key={tp} value={tp}>
                  {ENTER_LABEL[tp]}
                </option>
              ))}
            </select>
          </div>
          <div className={row}>
            <span className={label}>Appears at</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={parentEntryMs}
                max={15000}
                step={100}
                value={appearsAtMs}
                // Absolute scene-time. A child defaults to its parent's entry time and can't be set
                // earlier; the stored value is author-relative (absolute − parent entry).
                onChange={(e) =>
                  emitAnim({ startMs: Math.max(0, (Number(e.target.value) || 0) - parentEntryMs) })
                }
                aria-label="Group appearance timestamp"
                title={parentEntryMs > 0 ? `Can't appear before its parent's entry (${parentEntryMs}ms)` : undefined}
                className={`${field} w-20`}
              />
              <span className="text-[11px] text-walshe-grey">ms</span>
            </div>
          </div>
          <div className={row}>
            <span className={label}>Duration</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={100}
                max={5000}
                step={100}
                value={durationMs}
                disabled={enter === "none"}
                onChange={(e) => emitAnim({ durationMs: Math.max(1, Number(e.target.value) || DEFAULT_GROUP_ENTER_MS) })}
                aria-label="Group entrance duration"
                className={`${field} w-20 disabled:opacity-40`}
              />
              <span className="text-[11px] text-walshe-grey">ms</span>
            </div>
          </div>
          <div className={row}>
            <span className={label}>Easing</span>
            <select
              value={ease}
              disabled={enter === "none"}
              onChange={(e) => emitAnim({ ease: e.target.value as Easing })}
              aria-label="Group entrance easing"
              className={`${field} w-36 disabled:opacity-40`}
            >
              {EASINGS.map((es) => (
                <option key={es} value={es}>
                  {EASE_LABEL[es]}
                </option>
              ))}
            </select>
          </div>
          <div className={row}>
            <span className={label}>Emphasis</span>
            <select
              value={loopType}
              onChange={(e) => emitAnim({ loop: e.target.value as GroupLoop })}
              aria-label="Group emphasis loop"
              className={`${field} w-36`}
            >
              <option value="none">None</option>
              <option value="pulse">Pulse</option>
              <option value="bob">Bob</option>
            </select>
          </div>
          <div className={row}>
            <span className={label}>Colour</span>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#111111"}
              onChange={(e) => onChange(updateGroupStyle(design, sceneIndex, activeGroupId, { color: e.target.value }))}
              aria-label="Group colour"
              className="h-8 w-14 cursor-pointer rounded-md border border-walshe-line bg-walshe-base"
            />
          </div>
          <div className={row}>
            <span className={label}>Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => onChange(updateGroupStyle(design, sceneIndex, activeGroupId, { opacity: Number(e.target.value) / 100 }))}
              aria-label="Group opacity"
              className="w-32"
            />
          </div>
          <div className="flex gap-2 border-t border-walshe-line/70 pt-2.5">
            <button
              type="button"
              onClick={() => onChange(ungroupNodes(design, sceneIndex, activeGroupId))}
              className="flex-1 rounded-md border border-walshe-line bg-walshe-stone/60 px-2 py-2 text-small font-medium text-walshe-ink transition-colors hover:bg-walshe-ink/10"
            >
              Ungroup
            </button>
            <button
              type="button"
              onClick={() => onChange(duplicateGroup(design, sceneIndex, activeGroupId))}
              className="flex-1 rounded-md border border-walshe-line bg-walshe-stone/60 px-2 py-2 text-small font-medium text-walshe-ink transition-colors hover:bg-walshe-ink/10"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(deleteGroup(design, sceneIndex, activeGroupId));
                onClearSelection();
              }}
              className="flex-1 rounded-md border border-walshe-danger/40 bg-walshe-danger/10 px-2 py-2 text-small font-medium text-walshe-danger transition-colors hover:bg-walshe-danger/20"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

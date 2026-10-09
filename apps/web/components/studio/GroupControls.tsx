"use client";

import {
  EASINGS,
  ENTER_TYPES,
  DEFAULT_GROUP_ENTER_MS,
  deleteGroup,
  duplicateGroup,
  groupParentEntryMs,
  groupRegistry,
  renameGroup,
  setGroupAnim,
  ungroupNodes,
  updateGroupStyle,
  type DesignDoc,
  type Easing,
  type EnterType,
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

/**
 * The group-level controls (AC2/AC7), rendered IN the shared Edit-element window when a group row is
 * the active edit target — so a group and an element are never edited at once. Entrance type/appears-
 * at/duration/easing + emphasis loop write the group registry; colour/opacity patch every member;
 * rename/ungroup/duplicate/delete act on the whole subtree. Timing is baked by recomposeSceneGroups.
 */
export default function GroupControls({
  design,
  sceneIndex,
  groupId,
  onChange,
  onDeleted,
}: {
  design: DesignDoc;
  sceneIndex: number;
  groupId: string;
  onChange: (next: DesignDoc) => void;
  onDeleted: () => void;
}) {
  const scene = design.scenes[sceneIndex];
  const reg = scene ? groupRegistry(scene) : new Map();
  const group = reg.get(groupId);
  if (!scene || !group) return null;

  const firstMember = scene.nodes.find((n) => n.groupId === groupId);
  const enter: EnterType | "none" = group.anim?.enter ?? "none";
  const durationMs = group.anim?.durationMs ?? DEFAULT_GROUP_ENTER_MS;
  const ease: Easing = group.anim?.ease ?? "easeOut";
  // "Appears at" shows ABSOLUTE scene-time: it defaults to (and is clamped at) the parent's entry
  // time, so a child can't appear before its parent. Stored value stays author-relative.
  const parentEntryMs = groupParentEntryMs(scene, groupId);
  const arrivalRelMs = group.anim?.startMs ?? 0;
  const appearsAtMs = parentEntryMs + arrivalRelMs;
  const loopType: GroupLoop =
    group.anim?.loop?.type === "pulse" || group.anim?.loop?.type === "bob" ? group.anim.loop.type : "none";
  const color = firstMember?.color ?? "#111111";
  const opacity = Math.round((firstMember?.opacity ?? 1) * 100);

  function emitAnim(next: Partial<{ enter: EnterType | "none"; loop: GroupLoop; durationMs: number; ease: Easing; startMs: number }>) {
    const e = next.enter ?? enter;
    const l = next.loop ?? loopType;
    const dur = next.durationMs ?? durationMs;
    const es = next.ease ?? ease;
    const sm = next.startMs ?? arrivalRelMs;
    onChange(
      setGroupAnim(
        design,
        sceneIndex,
        groupId,
        e === "none" ? null : e,
        l === "none" ? undefined : { type: l, periodMs: 1200 },
        { durationMs: dur, ease: es, startMs: sm },
      ),
    );
  }

  return (
    <div className="space-y-1">
      <div className={row}>
        <span className={label}>Name</span>
        <input
          value={group.name ?? ""}
          placeholder="Group"
          onChange={(e) => onChange(renameGroup(design, sceneIndex, groupId, e.target.value))}
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
            onChange={(e) => emitAnim({ startMs: Math.max(0, (Number(e.target.value) || 0) - parentEntryMs) })}
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
          onChange={(e) => onChange(updateGroupStyle(design, sceneIndex, groupId, { color: e.target.value }))}
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
          onChange={(e) => onChange(updateGroupStyle(design, sceneIndex, groupId, { opacity: Number(e.target.value) / 100 }))}
          aria-label="Group opacity"
          className="w-32"
        />
      </div>
      <div className="flex gap-2 border-t border-walshe-line/70 pt-2.5">
        <button
          type="button"
          onClick={() => onChange(ungroupNodes(design, sceneIndex, groupId))}
          className="flex-1 rounded-md border border-walshe-line bg-walshe-stone/60 px-2 py-2 text-small font-medium text-walshe-ink transition-colors hover:bg-walshe-ink/10"
        >
          Ungroup
        </button>
        <button
          type="button"
          onClick={() => onChange(duplicateGroup(design, sceneIndex, groupId))}
          className="flex-1 rounded-md border border-walshe-line bg-walshe-stone/60 px-2 py-2 text-small font-medium text-walshe-ink transition-colors hover:bg-walshe-ink/10"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(deleteGroup(design, sceneIndex, groupId));
            onDeleted();
          }}
          className="flex-1 rounded-md border border-walshe-danger/40 bg-walshe-danger/10 px-2 py-2 text-small font-medium text-walshe-danger transition-colors hover:bg-walshe-danger/20"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

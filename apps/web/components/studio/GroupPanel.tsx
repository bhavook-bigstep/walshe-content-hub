"use client";

import { ENTER_TYPES, type EnterType } from "../../lib/studio/ops";

type LoopType = "none" | "pulse" | "bob";

/** The group's current shared values, read back from its members so the controls always reflect the
 * live design (not stale local state) — this is what keeps a property visible after you reopen. */
export interface GroupState {
  enter: EnterType | "none";
  loop: LoopType;
  opacity: number; // 0–100
  color: string;
}

interface Props {
  count: number;
  /** Whether the selection is already a group (vs. a loose multi-selection). */
  isGroup: boolean;
  groupId: string | null;
  /** The group's current shared values (null for a loose, ungrouped multi-selection). */
  state: GroupState | null;
  onGroup: () => void;
  onUngroup: () => void;
  /** Apply an entrance + emphasis loop to every member of the group. */
  onAnim: (enter: EnterType | null, loop: { type: "pulse" | "bob"; periodMs: number } | undefined) => void;
  onOpacity: (opacity: number) => void;
  onColor: (color: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const ENTER_LABEL: Record<EnterType | "none", string> = {
  none: "None",
  fade: "Fade in",
  rise: "Rise up",
  "slide-left": "Slide in ←",
  "slide-right": "Slide in →",
  scale: "Scale up",
};

const row = "flex items-center justify-between gap-2 py-1.5";
const label = "text-[11px] font-semibold uppercase tracking-wide text-walshe-grey";
const field = "h-8 rounded-md border border-walshe-line bg-walshe-base px-2 text-small text-walshe-ink focus:border-walshe-mint focus:outline-none";

/** The panel shown when 2+ elements are selected: group / ungroup, and (for a group) shared
 * animation, opacity, colour, plus duplicate / delete — applied to every member together. Every
 * control is driven by `state` (read back from the members), so a property stays visible after the
 * panel is closed and reopened. */
export default function GroupPanel({
  count,
  isGroup,
  state,
  onGroup,
  onUngroup,
  onAnim,
  onOpacity,
  onColor,
  onDuplicate,
  onDelete,
}: Props) {
  const enter = state?.enter ?? "none";
  const loop = state?.loop ?? "none";
  const opacity = state?.opacity ?? 100;
  const color = state?.color ?? "#111111";

  function emitAnim(next: Partial<{ enter: EnterType | "none"; loop: LoopType }>) {
    const e = next.enter ?? enter;
    const l = next.loop ?? loop;
    onAnim(e === "none" ? null : e, l === "none" ? undefined : { type: l, periodMs: 1200 });
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">
        {isGroup ? `Group · ${count} items` : `${count} selected`}
      </p>

      {isGroup ? (
        <button
          type="button"
          onClick={onUngroup}
          className="w-full rounded-md border border-walshe-line bg-walshe-stone/60 px-3 py-2 text-small font-medium text-walshe-ink transition-colors hover:bg-walshe-ink/10"
        >
          Ungroup
        </button>
      ) : (
        <button
          type="button"
          onClick={onGroup}
          className="w-full rounded-md border border-walshe-teal bg-walshe-teal px-3 py-2 text-small font-semibold text-white transition-colors hover:bg-walshe-teal/90"
        >
          Group {count} items
        </button>
      )}

      {isGroup && (
        <>
          <p className="border-t border-walshe-line/70 pt-2.5 text-[11px] text-walshe-grey">Applied to every item:</p>
          <div className={row}>
            <span className={label}>Entrance</span>
            <select
              value={enter}
              onChange={(e) => emitAnim({ enter: e.target.value as EnterType | "none" })}
              aria-label="Group entrance animation"
              className={`${field} w-36`}
            >
              {(["none", ...ENTER_TYPES] as (EnterType | "none")[]).map((tp) => (
                <option key={tp} value={tp}>{ENTER_LABEL[tp]}</option>
              ))}
            </select>
          </div>
          <div className={row}>
            <span className={label}>Emphasis</span>
            <select
              value={loop}
              onChange={(e) => emitAnim({ loop: e.target.value as LoopType })}
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
              onChange={(e) => onColor(e.target.value)}
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
              onChange={(e) => onOpacity(Number(e.target.value) / 100)}
              aria-label="Group opacity"
              className="w-32"
            />
          </div>
          <div className="flex gap-2 border-t border-walshe-line/70 pt-2.5">
            <button
              type="button"
              onClick={onDuplicate}
              className="flex-1 rounded-md border border-walshe-line bg-walshe-stone/60 px-3 py-2 text-small font-medium text-walshe-ink transition-colors hover:bg-walshe-ink/10"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex-1 rounded-md border border-walshe-danger/40 bg-walshe-danger/10 px-3 py-2 text-small font-medium text-walshe-danger transition-colors hover:bg-walshe-danger/20"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

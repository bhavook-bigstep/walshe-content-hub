"use client";

import { useEffect, useState } from "react";
import { ENTER_TYPES, type EnterType } from "../../lib/studio/ops";

type LoopType = "none" | "pulse" | "bob";

interface Props {
  count: number;
  /** Whether the selection is already a group (vs. a loose multi-selection). */
  isGroup: boolean;
  groupId: string | null;
  onGroup: () => void;
  onUngroup: () => void;
  /** Apply an entrance + emphasis loop to every member of the group. */
  onAnim: (enter: EnterType | null, loop: { type: "pulse" | "bob"; periodMs: number } | undefined) => void;
  onOpacity: (opacity: number) => void;
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

/** The panel shown when 2+ elements are selected: group / ungroup, and (for a group) animation and
 * opacity applied to every member together. */
export default function GroupPanel({ count, isGroup, groupId, onGroup, onUngroup, onAnim, onOpacity }: Props) {
  const [enter, setEnter] = useState<EnterType | "none">("none");
  const [loop, setLoop] = useState<LoopType>("none");
  const [opacity, setOpacity] = useState(100);

  // Reset the controls when a different group is selected.
  useEffect(() => {
    setEnter("none");
    setLoop("none");
    setOpacity(100);
  }, [groupId]);

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
              onChange={(e) => { const v = e.target.value as EnterType | "none"; setEnter(v); emitAnim({ enter: v }); }}
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
              onChange={(e) => { const v = e.target.value as LoopType; setLoop(v); emitAnim({ loop: v }); }}
              aria-label="Group emphasis loop"
              className={`${field} w-36`}
            >
              <option value="none">None</option>
              <option value="pulse">Pulse</option>
              <option value="bob">Bob</option>
            </select>
          </div>
          <div className={row}>
            <span className={label}>Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => { const v = Number(e.target.value); setOpacity(v); onOpacity(v / 100); }}
              aria-label="Group opacity"
              className="w-32"
            />
          </div>
        </>
      )}
    </div>
  );
}

// The single source of truth for the UNIFIED group-row control set (AC7 / D8): the folded panel
// exposes exactly these group-level controls. Kept as plain data (no React) so a hermetic test can
// render the panel (react-dom/server) and assert every listed control is actually present — making
// this list a VERIFIED contract, not a copy the panel can silently drift from.

/** Every group-level control the unified tree panel's group row must expose. */
export const GROUP_ROW_CONTROLS = [
  "group", // group a loose multi-selection
  "ungroup", // ungroup (reparents children)
  "nest", // the group button's sub-group mode: grouping a sub-selection nests it (via groupNodes)
  "rename", // set the group's tree label
  "entrance-type", // entrance preset
  "entrance-duration", // entrance duration (ms)
  "entrance-easing", // entrance easing
  "emphasis-loop", // emphasis/character loop
  "colour", // shared fill colour
  "opacity", // shared opacity
  "duplicate", // duplicate the whole subtree
  "delete", // delete the whole subtree
] as const;

export type GroupRowControl = (typeof GROUP_ROW_CONTROLS)[number];

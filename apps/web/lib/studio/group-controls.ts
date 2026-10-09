// The single source of truth for the UNIFIED group-row control set (AC7 / D8): the folded panel
// exposes exactly these group-level controls. Kept as plain data (no React) so the panel and a
// hermetic unit test can both assert against it without a DOM runner.

/** Every group-level control the unified tree panel's group row must expose. */
export const GROUP_ROW_CONTROLS = [
  "group", // group a loose multi-selection
  "ungroup", // ungroup (reparents children)
  "nest", // nest a sub-selection as a child group
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

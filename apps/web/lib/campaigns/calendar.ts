// Pure calendar helpers (no DOM). Dates render in the viewer's local timezone (design §4.1);
// there is no date library in this app, so we build the grid from native Date.

export function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  return cells;
}

// Local calendar key (YYYY-MM-DD) for a Date — the join key the month/week grids bucket on.
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function localDateKey(iso: string): string {
  return dayKey(new Date(iso));
}

export function bucketByLocalDay<T extends { scheduled_at: string | null }>(
  posts: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const p of posts) {
    if (!p.scheduled_at) continue;
    const key = localDateKey(p.scheduled_at);
    const list = m.get(key) ?? [];
    list.push(p);
    m.set(key, list);
  }
  return m;
}

export const STATUS_CHIP: Record<string, string> = {
  draft: "chip-draft",
  pending_approval: "chip-draft",
  approved: "chip-verified",
  publishing: "chip-draft",
  published: "chip-verified",
  rejected: "chip-draft",
  failed: "chip-draft",
  cancelled: "chip-draft",
};

// ── Week / Day / time helpers (pure, DOM-free, native Date, viewer-local) ───────────────────────

// A new Date n days after d. Uses setDate so month/year boundaries roll over; time-of-day is kept.
export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

// A new Date n months after d. The day-of-month is clamped to the target month's length so
// "31 Jan + 1 month" lands on 28/29 Feb rather than overflowing into March.
export function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  target.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return target;
}

// The Monday that starts d's week, at local midnight (Monday-based, matching monthCells padding).
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const mondayOffset = (r.getDay() + 6) % 7; // Monday = 0 … Sunday = 6
  r.setDate(r.getDate() - mondayOffset);
  return r;
}

// The 7 days of d's week, Monday → Sunday, each at local midnight.
export function weekDays(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Hours 0..23 — the rows of the week/day time grid.
export const HOURS: number[] = Array.from({ length: 24 }, (_, h) => h);

// Local minutes elapsed since midnight for an ISO instant — the vertical offset of a timed post.
export function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// Whether an ISO instant falls on the given local calendar day.
export function sameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

// Whether a campaign's inclusive [starts_on, ends_on] date range (YYYY-MM-DD strings) covers the
// given local day. Lexicographic comparison is correct for zero-padded ISO dates.
export function coversDay(range: { starts_on: string; ends_on: string }, day: Date): boolean {
  const k = dayKey(day);
  return range.starts_on <= k && k <= range.ends_on;
}

// ── Month overview: continuous campaign bars across a week ───────────────────────────────────────

export interface CampaignRange {
  id: number;
  name: string;
  starts_on: string;
  ends_on: string;
}

// A campaign drawn as ONE continuous bar within a single week row of the month grid.
export interface WeekBar {
  id: number;
  name: string;
  startCol: number; // 0 (Mon) … 6 (Sun)
  span: number; // number of columns the bar covers, 1 … 7
  lane: number; // vertical stacking row, 0-based
}

export interface WeekLayout {
  bars: WeekBar[];
  laneCount: number;
}

// Lay out campaigns as spanning bars across ONE week of the month grid, so a multi-day campaign
// reads as a single joined bar rather than a chip repeated on every day it covers.
//
// `week` is 7 cells (Date | null — nulls are padding days outside the displayed month). In-month
// days within a week are always contiguous (padding only ever sits at a month's leading/trailing
// edge), so each campaign yields at most one bar per week: the run of in-month columns its
// inclusive [starts_on, ends_on] range covers, clamped to the week. Bars are packed into lanes
// (greedy, earliest-start first) so overlapping campaigns stack without colliding.
export function layoutWeekBars(week: (Date | null)[], campaigns: CampaignRange[]): WeekLayout {
  const bars: WeekBar[] = [];
  for (const c of campaigns) {
    let startCol = -1;
    let endCol = -1;
    for (let i = 0; i < week.length; i++) {
      const day = week[i];
      if (day && coversDay(c, day)) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    }
    if (startCol === -1) continue; // range does not touch this week
    bars.push({ id: c.id, name: c.name, startCol, span: endCol - startCol + 1, lane: 0 });
  }

  // Greedy first-fit lane packing. Sorting by start column (longer bar first on ties) keeps the
  // assignment stable and uses the fewest lanes for a given set of intervals.
  bars.sort((a, b) => a.startCol - b.startCol || b.span - a.span || a.id - b.id);
  const laneNextFree: number[] = []; // first column each lane is free from (exclusive end of its last bar)
  for (const bar of bars) {
    let lane = 0;
    while (lane < laneNextFree.length && laneNextFree[lane] > bar.startCol) lane++;
    bar.lane = lane;
    laneNextFree[lane] = bar.startCol + bar.span;
  }
  return { bars, laneCount: laneNextFree.length };
}

import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  bucketByLocalDay,
  coversDay,
  dayKey,
  HOURS,
  layoutWeekBars,
  localDateKey,
  minutesSinceMidnight,
  monthCells,
  sameLocalDay,
  startOfWeek,
  weekDays,
} from "../lib/campaigns/calendar";

describe("monthCells", () => {
  it("pads to the first Monday and lists every day", () => {
    const cells = monthCells(2026, 7); // August 2026 (0-based) — 1 Aug is a Saturday
    expect(cells.filter((c) => c === null).length).toBe(5); // Mon..Fri padding before Sat
    expect(cells.filter((c) => c !== null).length).toBe(31);
  });
});

describe("localDateKey", () => {
  it("matches the viewer's local calendar date via an independent oracle (not self-referential)", () => {
    // A UTC-evening instant: its UTC date and a +ve-offset local date differ. localDateKey must
    // track the viewer's LOCAL date, whatever the runner TZ — compared to the standard en-CA
    // (YYYY-MM-DD) formatter, a different code path, so a wrong localDateKey would fail here.
    const iso = "2026-08-15T20:30:00+00:00";
    expect(localDateKey(iso)).toBe(new Date(iso).toLocaleDateString("en-CA"));
  });
});

describe("bucketByLocalDay", () => {
  it("buckets by local date and skips un-scheduled posts", () => {
    const rows = [
      { scheduled_at: "2026-08-15T12:00:00Z", id: 1 },
      { scheduled_at: "2026-08-15T18:00:00Z", id: 2 },
      { scheduled_at: null, id: 3 },
    ] as never[];
    const m = bucketByLocalDay(rows);
    expect(m.get(localDateKey("2026-08-15T12:00:00Z"))?.length).toBe(2);
    expect([...m.values()].flat().some((p: { id: number }) => p.id === 3)).toBe(false);
  });
});

describe("dayKey", () => {
  it("formats a local Date as YYYY-MM-DD and matches localDateKey's output", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05"); // zero-padded month + day
    // A Date built from the same local wall-clock instant keys identically to its ISO string.
    const d = new Date(2026, 7, 15, 20, 30);
    expect(dayKey(d)).toBe(localDateKey(d.toISOString()));
  });
});

describe("addDays", () => {
  it("rolls across month and year boundaries and preserves time-of-day", () => {
    const r = addDays(new Date(2026, 0, 31, 9, 15), 1); // 31 Jan -> 1 Feb
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 1, 1]);
    expect([r.getHours(), r.getMinutes()]).toEqual([9, 15]);
    const back = addDays(new Date(2026, 0, 1), -1); // 1 Jan -> 31 Dec previous year
    expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([2025, 11, 31]);
  });

  it("does not mutate its argument", () => {
    const d = new Date(2026, 5, 10);
    addDays(d, 5);
    expect(d.getDate()).toBe(10);
  });
});

describe("addMonths", () => {
  it("adds whole months and clamps an overflowing day to the target month", () => {
    const r = addMonths(new Date(2026, 0, 15), 1); // 15 Jan -> 15 Feb
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 1, 15]);
    const clamp = addMonths(new Date(2026, 0, 31), 1); // 31 Jan -> clamp to 28 Feb (2026 not leap)
    expect([clamp.getMonth(), clamp.getDate()]).toEqual([1, 28]);
    const back = addMonths(new Date(2026, 1, 10), -3); // Feb 2026 -> Nov 2025
    expect([back.getFullYear(), back.getMonth()]).toEqual([2025, 10]);
  });
});

describe("startOfWeek", () => {
  it("returns the Monday of the week at local midnight", () => {
    // 15 Aug 2026 is a Saturday (1 Aug is a Saturday); its Monday is 10 Aug.
    const mon = startOfWeek(new Date(2026, 7, 15, 18, 45));
    expect([mon.getMonth(), mon.getDate()]).toEqual([7, 10]);
    expect(mon.getDay()).toBe(1); // Monday
    expect([mon.getHours(), mon.getMinutes(), mon.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("treats Sunday as the last day of the Monday-based week", () => {
    const mon = startOfWeek(new Date(2026, 7, 16)); // Sun 16 Aug -> Mon 10 Aug
    expect(mon.getDate()).toBe(10);
  });
});

describe("weekDays", () => {
  it("lists 7 consecutive days Monday..Sunday", () => {
    const days = weekDays(new Date(2026, 7, 15));
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(1); // Mon
    expect(days[6].getDay()).toBe(0); // Sun
    expect([days[0].getMonth(), days[0].getDate()]).toEqual([7, 10]);
    expect([days[6].getMonth(), days[6].getDate()]).toEqual([7, 16]);
  });
});

describe("HOURS", () => {
  it("is 0..23", () => {
    expect(HOURS).toHaveLength(24);
    expect(HOURS[0]).toBe(0);
    expect(HOURS[23]).toBe(23);
  });
});

describe("minutesSinceMidnight", () => {
  it("counts local minutes from midnight, independent of the runner timezone", () => {
    // Round-trip through the viewer's local clock: an ISO built from a local wall-clock time
    // must read back as that same wall-clock time, whatever the runner TZ.
    const t = new Date(2026, 7, 15, 14, 45);
    expect(minutesSinceMidnight(t.toISOString())).toBe(14 * 60 + 45);
    const midnight = new Date(2026, 7, 15, 0, 0);
    expect(minutesSinceMidnight(midnight.toISOString())).toBe(0);
  });
});

describe("sameLocalDay", () => {
  it("matches an ISO instant to a local day and rejects neighbouring days", () => {
    const lateNight = new Date(2026, 7, 15, 23, 30);
    expect(sameLocalDay(lateNight.toISOString(), new Date(2026, 7, 15))).toBe(true);
    expect(sameLocalDay(lateNight.toISOString(), new Date(2026, 7, 16))).toBe(false);
    expect(sameLocalDay(lateNight.toISOString(), new Date(2026, 7, 14))).toBe(false);
  });
});

describe("coversDay", () => {
  it("includes the inclusive [starts_on, ends_on] range and excludes neighbours", () => {
    const c = { starts_on: "2026-10-08", ends_on: "2026-10-09" };
    expect(coversDay(c, new Date(2026, 9, 8))).toBe(true);
    expect(coversDay(c, new Date(2026, 9, 9))).toBe(true);
    expect(coversDay(c, new Date(2026, 9, 7))).toBe(false);
    expect(coversDay(c, new Date(2026, 9, 10))).toBe(false);
  });
});

describe("layoutWeekBars", () => {
  // Mon..Sun of 5–11 Oct 2026 (a full in-month week; col0=Mon 5 … col6=Sun 11).
  const fullWeek = weekDays(new Date(2026, 9, 5));
  const range = (id: number, name: string, s: string, e: string) =>
    ({ id, name, starts_on: s, ends_on: e });

  it("produces one bar spanning the contiguous columns a range covers", () => {
    // Tue 6 Oct → Fri 9 Oct = cols 1..4.
    const { bars, laneCount } = layoutWeekBars(fullWeek, [range(1, "Launch", "2026-10-06", "2026-10-09")]);
    expect(laneCount).toBe(1);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ id: 1, name: "Launch", startCol: 1, span: 4, lane: 0 });
  });

  it("stacks overlapping campaigns into separate lanes", () => {
    const { bars, laneCount } = layoutWeekBars(fullWeek, [
      range(1, "A", "2026-10-05", "2026-10-07"), // cols 0..2
      range(2, "B", "2026-10-06", "2026-10-08"), // cols 1..3 — overlaps A
    ]);
    expect(laneCount).toBe(2);
    const lanes = Object.fromEntries(bars.map((b) => [b.id, b.lane]));
    expect(lanes[1]).not.toBe(lanes[2]);
  });

  it("packs non-overlapping campaigns onto the same lane", () => {
    const { laneCount } = layoutWeekBars(fullWeek, [
      range(1, "A", "2026-10-05", "2026-10-06"), // cols 0..1
      range(2, "B", "2026-10-09", "2026-10-10"), // cols 4..5 — no overlap
    ]);
    expect(laneCount).toBe(1);
  });

  it("excludes padding days and clamps a range that starts before the month", () => {
    // First week of October 2026 = [null,null,null, Oct1(Thu), Oct2, Oct3, Oct4].
    const firstWeek = monthCells(2026, 9).slice(0, 7);
    // Range 28 Sep → 2 Oct: only the in-month cols (Oct1=col3, Oct2=col4) count; nulls excluded.
    const { bars } = layoutWeekBars(firstWeek, [range(1, "Early", "2026-09-28", "2026-10-02")]);
    expect(bars[0]).toMatchObject({ startCol: 3, span: 2 });
  });

  it("omits a campaign that does not touch the week", () => {
    const { bars, laneCount } = layoutWeekBars(fullWeek, [range(1, "Later", "2026-10-20", "2026-10-25")]);
    expect(bars).toHaveLength(0);
    expect(laneCount).toBe(0);
  });
});

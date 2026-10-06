import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  bucketByLocalDay,
  coversDay,
  dayKey,
  HOURS,
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

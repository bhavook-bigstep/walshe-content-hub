import { describe, expect, it } from "vitest";
import { bucketByLocalDay, localDateKey, monthCells } from "../lib/campaigns/calendar";

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

import { describe, expect, it } from "vitest";
import { bucketByLocalDay, localDateKey, monthCells } from "../lib/campaigns/calendar";

describe("monthCells", () => {
  it("pads to the first Monday and lists every day", () => {
    const cells = monthCells(2026, 7); // August 2026 (0-based) — 1 Aug is a Saturday
    expect(cells.filter((c) => c === null).length).toBe(5); // Mon..Fri padding before Sat
    expect(cells.filter((c) => c !== null).length).toBe(31);
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

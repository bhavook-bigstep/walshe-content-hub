import { describe, expect, test } from "vitest";
import { relativeTime } from "../lib/social/timing";

const NOW = new Date("2026-01-02T12:00:00Z");

describe("relativeTime", () => {
  test("future times read 'in …'", () => {
    expect(relativeTime("2026-01-04T12:00:00Z", NOW)).toBe("in 2 days");
    expect(relativeTime("2026-01-02T15:00:00Z", NOW)).toBe("in 3 hours");
    expect(relativeTime("2026-01-02T12:30:00Z", NOW)).toBe("in 30 minutes");
  });

  test("past times read '… ago'", () => {
    expect(relativeTime("2025-12-31T12:00:00Z", NOW)).toBe("2 days ago");
    expect(relativeTime("2026-01-02T11:00:00Z", NOW)).toBe("1 hour ago");
  });

  test("sub-minute differences read as 'just now' / 'any moment'", () => {
    expect(relativeTime("2026-01-02T11:59:30Z", NOW)).toBe("just now");
    expect(relativeTime("2026-01-02T12:00:30Z", NOW)).toBe("any moment");
  });
});

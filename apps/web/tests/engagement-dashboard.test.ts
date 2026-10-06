import { describe, expect, test } from "vitest";
import { latestByPost, sumMetric } from "../lib/engagement/metrics";

const rows = [
  { post_id: 1, platform: "instagram", metrics: { reach: 10, total_interactions: 3 }, fetched_at: "2026-01-01T00:00:00Z" },
  { post_id: 1, platform: "instagram", metrics: { reach: 25, total_interactions: 7 }, fetched_at: "2026-01-02T00:00:00Z" },
  { post_id: 2, platform: "instagram", metrics: { reach: 5, total_interactions: 1 }, fetched_at: "2026-01-01T00:00:00Z" },
];

describe("engagement metrics helpers", () => {
  test("latestByPost keeps the newest snapshot per post", () => {
    const latest = latestByPost(rows);
    expect(latest.length).toBe(2);
    expect(latest.find((r) => r.post_id === 1)!.metrics.reach).toBe(25);
  });

  test("sumMetric sums the latest snapshot per post, 0 for missing keys", () => {
    expect(sumMetric(rows, "reach")).toBe(30); // 25 (post 1 latest) + 5 (post 2)
    expect(sumMetric(rows, "total_interactions")).toBe(8); // 7 + 1
    expect(sumMetric(rows, "nope")).toBe(0);
  });

  test("tolerates a row with missing/undefined metrics (legacy/stale data) without crashing", () => {
    const bad = [
      { post_id: 3, platform: "instagram", fetched_at: "2026-01-03T00:00:00Z" },
    ] as unknown as Parameters<typeof sumMetric>[0];
    expect(() => sumMetric(bad, "reach")).not.toThrow();
    expect(sumMetric(bad, "reach")).toBe(0);
  });
});

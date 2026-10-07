import { describe, expect, test } from "vitest";
import { truncateLabel } from "../components/charts/EngagementChart";

describe("truncateLabel", () => {
  test("leaves a short label untouched", () => {
    expect(truncateLabel("Galway", 10)).toBe("Galway");
    expect(truncateLabel("exactly-10", 10)).toBe("exactly-10"); // length == max is not truncated
  });

  test("truncates a long label to the budget with a trailing ellipsis", () => {
    const out = truncateLabel("abcdefghij", 5);
    expect(out).toBe("abcd…");
    expect(out.length).toBe(5); // ellipsis counts toward the budget
  });

  test("never produces an empty label even at a tiny budget", () => {
    expect(truncateLabel("Galway launch post", 1)).toBe("G…");
  });
});

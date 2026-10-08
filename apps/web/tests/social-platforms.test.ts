import { describe, expect, test } from "vitest";
import { DEFAULT_CONNECTED, mergeConnections, SOCIAL_PLATFORMS } from "../lib/social/platforms";

describe("social platforms", () => {
  test("offers the five PoC platforms with Instagram first", () => {
    expect(SOCIAL_PLATFORMS.map((p) => p.key)).toEqual([
      "instagram",
      "facebook",
      "x",
      "tiktok",
      "youtube",
    ]);
  });

  test("only Instagram is connected by default", () => {
    const merged = mergeConnections(null);
    expect(merged.instagram).toBe(true);
    expect(merged.facebook).toBeFalsy();
    expect(merged.tiktok).toBeFalsy();
    expect(DEFAULT_CONNECTED.instagram).toBe(true);
  });

  test("a stored map merges over the defaults (Instagram stays unless turned off)", () => {
    expect(mergeConnections({ facebook: true }).instagram).toBe(true); // default preserved
    expect(mergeConnections({ facebook: true }).facebook).toBe(true); // stored added
    expect(mergeConnections({ instagram: false }).instagram).toBe(false); // explicit off wins
  });
});

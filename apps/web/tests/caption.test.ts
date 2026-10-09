import { describe, expect, it } from "vitest";
import { appendHashtags } from "../lib/ai/caption";

describe("appendHashtags", () => {
  it("returns just the tag line when the caption is empty", () => {
    expect(appendHashtags("", ["#Travel", "#Clare"])).toBe("#Travel #Clare");
    expect(appendHashtags("   ", ["#Travel"])).toBe("#Travel");
  });

  it("appends tags after a blank line, preserving the caption", () => {
    expect(appendHashtags("Visit the cliffs!", ["#Travel", "#Clare"])).toBe(
      "Visit the cliffs!\n\n#Travel #Clare",
    );
  });

  it("skips tags already present (case-insensitive) and de-dupes the new set", () => {
    expect(appendHashtags("Lovely day #Travel", ["#travel", "#Clare", "#CLARE"])).toBe(
      "Lovely day #Travel\n\n#Clare",
    );
  });

  it("returns the caption unchanged when every tag is a duplicate or blank", () => {
    expect(appendHashtags("Trip #Travel", ["#travel", "  ", ""])).toBe("Trip #Travel");
    expect(appendHashtags("Trip #Travel", [])).toBe("Trip #Travel");
  });
});

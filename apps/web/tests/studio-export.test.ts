import { describe, expect, it } from "vitest";
import { filenameFor } from "../lib/studio/export";

describe("studio export", () => {
  it("test_filename_for", () => {
    expect(filenameFor("social")).toBe("walsh-social.png");
    expect(filenameFor("story", "pdf")).toBe("walsh-story.pdf");
    expect(filenameFor("pamphlet", "html")).toBe("walsh-pamphlet.html");
    expect(filenameFor("pamphlet", "png", 2)).toBe("walsh-pamphlet-p2.png");
    expect(filenameFor("social", "png")).toBe(filenameFor("social", "png"));
  });
});

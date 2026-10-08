import { describe, expect, it } from "vitest";
import { addText, newDesign } from "../lib/studio/ops";
import { moderateWorkspace, type ModeratableEntry } from "../lib/studio/moderation";

// Content moderation (Contract 1 + Contract 4): the canvas copy is checked against the attached
// collection entries; deterministic so it can be asserted. Synthetic fixtures only.
const entries: ModeratableEntry[] = [
  {
    id: 1,
    title: "Galway Food Tour",
    fields: [
      { label: "Title", value: "Galway Food Tour" },
      { label: "Description", value: "A guided walking food tour of Galway for €450 per person." },
      { label: "Location", value: "Galway, Ireland" },
    ],
  },
];

describe("studio content moderation", () => {
  it("test_grounded_copy_has_no_flags", () => {
    let d = newDesign("social");
    d = addText(d, 0, "Galway Food Tour");
    d = addText(d, 0, "A guided walking food tour of Galway");
    expect(moderateWorkspace(d, entries)).toEqual([]);
  });

  it("test_flags_number_mismatch_against_entry", () => {
    let d = newDesign("social");
    d = addText(d, 0, "Galway food tour — only €999 per person");
    const flags = moderateWorkspace(d, entries);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("mismatch");
    expect(flags[0].detail).toContain("999");
    expect(flags[0].entryTitle).toBe("Galway Food Tour");
  });

  it("test_flags_unsourced_copy_not_in_any_entry", () => {
    let d = newDesign("social");
    d = addText(d, 0, "Swim with dolphins in Fiji for 7 unforgettable days");
    const flags = moderateWorkspace(d, entries);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("unsourced");
  });

  it("test_ignores_generic_cta_copy", () => {
    let d = newDesign("social");
    d = addText(d, 0, "Book now");
    expect(moderateWorkspace(d, entries)).toEqual([]);
  });

  it("test_no_entries_means_nothing_to_check", () => {
    let d = newDesign("social");
    d = addText(d, 0, "Anything at all priced at 500 dollars");
    expect(moderateWorkspace(d, [])).toEqual([]);
  });

  it("test_deterministic_and_mismatch_sorts_first", () => {
    let d = newDesign("social");
    d = addText(d, 0, "Galway food tour — only €999 per person");
    d = addText(d, 0, "Swim with dolphins in Fiji for 7 days");
    const a = moderateWorkspace(d, entries);
    const b = moderateWorkspace(d, entries);
    expect(a).toEqual(b);
    expect(a.map((f) => f.severity)).toEqual(["mismatch", "unsourced"]);
  });
});

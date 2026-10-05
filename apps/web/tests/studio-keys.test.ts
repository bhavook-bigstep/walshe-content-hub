import { describe, expect, it } from "vitest";
import { shouldDeleteSelection, type DeleteKeyContext } from "../lib/studio/keys";

// AC48 — the Delete/Backspace guard must never delete while the user is typing in a field or
// editing an entity's text inline, and only acts on a non-empty selection.
const base: DeleteKeyContext = {
  key: "Delete",
  activeTag: "DIV",
  isContentEditable: false,
  editing: false,
  targetCount: 1,
};

describe("shouldDeleteSelection", () => {
  it("deletes on Delete/Backspace with a plain element focused and a selection", () => {
    expect(shouldDeleteSelection(base)).toBe(true);
    expect(shouldDeleteSelection({ ...base, key: "Backspace" })).toBe(true);
    expect(shouldDeleteSelection({ ...base, activeTag: null })).toBe(true);
  });

  it("never deletes while typing in a form field or contentEditable", () => {
    expect(shouldDeleteSelection({ ...base, activeTag: "INPUT" })).toBe(false);
    expect(shouldDeleteSelection({ ...base, key: "Backspace", activeTag: "TEXTAREA" })).toBe(false);
    expect(shouldDeleteSelection({ ...base, activeTag: "SELECT" })).toBe(false);
    expect(shouldDeleteSelection({ ...base, key: "Backspace", isContentEditable: true })).toBe(false);
  });

  it("never deletes while an entity's text is being edited inline", () => {
    expect(shouldDeleteSelection({ ...base, editing: true })).toBe(false);
  });

  it("does nothing without a selection or for other keys", () => {
    expect(shouldDeleteSelection({ ...base, targetCount: 0 })).toBe(false);
    expect(shouldDeleteSelection({ ...base, key: "a" })).toBe(false);
  });
});

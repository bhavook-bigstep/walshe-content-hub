import { describe, expect, it } from "vitest";
import {
  pointerMode,
  shouldDeleteSelection,
  type DeleteKeyContext,
  type PointerContext,
} from "../lib/studio/keys";

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

// AC86 — CorelDraw-style pointer model: marquee-select vs click-an-item vs pan-the-workspace are
// decided in one place, so the three gestures never collide.
const pt: PointerContext = { tool: "select", spaceHeld: false, alt: false, button: 0, onEmpty: true };

describe("pointerMode", () => {
  it("Select tool left-drag on empty space draws a marquee (not a pan)", () => {
    expect(pointerMode(pt)).toBe("marquee");
  });

  it("pressing an element means object interaction (select/move)", () => {
    expect(pointerMode({ ...pt, onEmpty: false })).toBe("object");
  });

  it("Hand tool, Space-hold, Alt-drag or middle button always pan", () => {
    expect(pointerMode({ ...pt, tool: "hand" })).toBe("pan");
    expect(pointerMode({ ...pt, tool: "hand", onEmpty: false })).toBe("pan"); // even over an element
    expect(pointerMode({ ...pt, spaceHeld: true })).toBe("pan");
    expect(pointerMode({ ...pt, alt: true })).toBe("pan");
    expect(pointerMode({ ...pt, button: 1 })).toBe("pan");
  });
});

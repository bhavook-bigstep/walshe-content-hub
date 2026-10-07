// Pure decision for the canvas Delete/Backspace handler, extracted so the guard (never delete while
// typing in a field or editing inline text) is unit-testable without a DOM.

export interface DeleteKeyContext {
  /** KeyboardEvent.key */
  key: string;
  /** document.activeElement.tagName (uppercase), or null */
  activeTag: string | null;
  /** document.activeElement.isContentEditable */
  isContentEditable: boolean;
  /** a selected canvas object is in inline text-edit mode */
  editing: boolean;
  /** number of selected entities */
  targetCount: number;
}

const TEXT_INPUT_TAGS = /^(INPUT|TEXTAREA|SELECT)$/;

/** True only when Delete/Backspace should remove the current canvas selection. */
export function shouldDeleteSelection(ctx: DeleteKeyContext): boolean {
  if (ctx.key !== "Delete" && ctx.key !== "Backspace") return false;
  if (ctx.activeTag && TEXT_INPUT_TAGS.test(ctx.activeTag)) return false; // typing in a field
  if (ctx.isContentEditable) return false;
  if (ctx.editing) return false; // editing an entity's text inline
  return ctx.targetCount > 0;
}

// ── Pointer intent (CorelDraw/Figma-style) ─────────────────────────────────────────────────────

export type CanvasTool = "select" | "hand";

export interface PointerContext {
  /** the active workspace tool */
  tool: CanvasTool;
  /** Space bar held down */
  spaceHeld: boolean;
  /** Alt/Option held down */
  alt: boolean;
  /** MouseEvent.button (0 left, 1 middle, 2 right) */
  button: number;
  /** the press landed on empty workspace (no element under the pointer) */
  onEmpty: boolean;
}

/**
 * What a pointer press means, so marquee-select vs click-an-item vs pan-the-workspace are decided
 * in one tested place (extracted from the Fabric handler so it needs no DOM):
 *  • "pan"     — Hand tool, Space-hold, Alt-drag or middle button: drag moves the viewport.
 *  • "marquee" — Select tool, left press on empty space: a drag rubber-bands a selection box.
 *  • "object"  — press on an element: click selects it, drag moves it.
 */
export function pointerMode(ctx: PointerContext): "pan" | "marquee" | "object" {
  if (ctx.spaceHeld || ctx.alt || ctx.button === 1 || ctx.tool === "hand") return "pan";
  return ctx.onEmpty ? "marquee" : "object";
}

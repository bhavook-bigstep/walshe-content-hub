// The studio's font palette — one source of truth shared by the Inspector dropdown, the brand-kit
// typography picker, and the brand-apply op. A brand kit stores a short KEY (sans/serif/…); the
// studio maps it to a CSS font stack it sets on text nodes' `fontFamily`.

export type FontKey = "sans" | "serif" | "display" | "rounded" | "mono";

export interface FontOption {
  key: FontKey;
  label: string;
  /** the CSS font stack written to a text node's fontFamily */
  value: string;
}

export const FONTS: readonly FontOption[] = [
  { key: "sans", label: "Sans (Inter)", value: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { key: "serif", label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { key: "display", label: "Display", value: "'Arial Black', Impact, sans-serif" },
  { key: "rounded", label: "Rounded", value: "'Trebuchet MS', Verdana, sans-serif" },
  { key: "mono", label: "Mono", value: "'Courier New', ui-monospace, monospace" },
];

export const FONT_KEYS: readonly FontKey[] = FONTS.map((f) => f.key);

/** The CSS font stack for a brand font key (falls back to the first font for an unknown key). */
export function fontStack(key: string | undefined): string {
  return FONTS.find((f) => f.key === key)?.value ?? FONTS[0].value;
}

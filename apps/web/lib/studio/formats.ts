/**
 * Design Studio format presets (AC8).
 *
 * The agent picks a format before composing: a square **social** image, a tall **story**, or a
 * multi-page **pamphlet**. Each preset fixes the canvas dimensions and the initial page count
 * (pamphlets are multi-page; social/story are single-page). These are pure data + a lookup so the
 * Fabric.js canvas, the PDF export, and the e2e smoke all agree on one source of truth.
 *
 * Dimensions are in pixels at the canvas's working resolution. Pamphlet pages use an A4-ish
 * portrait ratio (~1:1.414) so the reportlab A4 PDF export (apps/api/app/media/pdf.py) maps 1:1.
 */

export type FormatName = "social" | "story" | "pamphlet";

export interface FormatPreset {
  /** Stable key, identical to the record key — handy when a preset travels without its key. */
  readonly name: FormatName;
  /** Human label for the format picker UI. */
  readonly label: string;
  readonly width: number;
  readonly height: number;
  /** Number of pages the format starts with. Only a pamphlet is multi-page. */
  readonly pages: number;
  /** Whether the agent may add/remove pages (pamphlet only). */
  readonly multiPage: boolean;
}

export const FORMAT_PRESETS: Readonly<Record<FormatName, FormatPreset>> = {
  social: { name: "social", label: "Social image", width: 1080, height: 1080, pages: 1, multiPage: false },
  story: { name: "story", label: "Story", width: 1080, height: 1920, pages: 1, multiPage: false },
  pamphlet: { name: "pamphlet", label: "Pamphlet", width: 1240, height: 1754, pages: 4, multiPage: true },
};

/** Every format name, in display order — drives the Size menu in the studio menu bar. */
export const FORMAT_NAMES: readonly FormatName[] = ["social", "story", "pamphlet"];

export function isFormatName(value: string): value is FormatName {
  return value === "social" || value === "story" || value === "pamphlet";
}

/** Look up a preset by name. Throws on an unknown format so a typo fails loudly, not silently. */
export function getFormatPreset(name: string): FormatPreset {
  if (!isFormatName(name)) {
    throw new Error(`Unknown studio format: ${name}`);
  }
  return FORMAT_PRESETS[name];
}

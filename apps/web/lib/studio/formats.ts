/**
 * Design Studio format presets (AC8, extended by AC88).
 *
 * The agent picks a format before composing. Formats span every common size + orientation:
 * square and portrait social posts, a tall story, a 16:9 presentation, a wide banner, a portrait
 * flyer, a multi-page pamphlet, and a landscape business card. Each preset fixes the canvas
 * dimensions and the initial page count (only the pamphlet is multi-page). Pure data + a lookup so
 * the Fabric.js canvas, the PDF export, the backend dims and the e2e smoke all agree on one source
 * of truth.
 *
 * Dimensions are in pixels at the canvas's working resolution. The pamphlet + flyer use an A4-ish
 * portrait ratio (~1:1.414) so the reportlab A4 PDF export (apps/api/app/media/pdf.py) maps cleanly.
 */

export type FormatName =
  | "social" // 1:1 square post
  | "post" // 4:5 portrait post
  | "story" // 9:16 full-screen story / reel
  | "wide" // 16:9 presentation / slide
  | "banner" // wide landscape banner
  | "flyer" // A4 portrait print flyer
  | "pamphlet" // A4 portrait, multi-page
  | "card"; // business-card landscape

export interface FormatPreset {
  /** Stable key, identical to the record key — handy when a preset travels without its key. */
  readonly name: FormatName;
  /** Human label for the format picker UI. */
  readonly label: string;
  /** Orientation, for grouping/affordances in the picker. */
  readonly orientation: "square" | "portrait" | "landscape";
  readonly width: number;
  readonly height: number;
  /** Number of pages the format starts with. Only a pamphlet is multi-page. */
  readonly pages: number;
  /** Whether the agent may add/remove pages (pamphlet only). */
  readonly multiPage: boolean;
}

export const FORMAT_PRESETS: Readonly<Record<FormatName, FormatPreset>> = {
  social: { name: "social", label: "Square post", orientation: "square", width: 1080, height: 1080, pages: 1, multiPage: false },
  post: { name: "post", label: "Portrait post", orientation: "portrait", width: 1080, height: 1350, pages: 1, multiPage: false },
  story: { name: "story", label: "Story", orientation: "portrait", width: 1080, height: 1920, pages: 1, multiPage: false },
  wide: { name: "wide", label: "Presentation", orientation: "landscape", width: 1920, height: 1080, pages: 1, multiPage: false },
  banner: { name: "banner", label: "Banner", orientation: "landscape", width: 1200, height: 628, pages: 1, multiPage: false },
  flyer: { name: "flyer", label: "Flyer", orientation: "portrait", width: 1480, height: 2096, pages: 1, multiPage: false },
  pamphlet: { name: "pamphlet", label: "Pamphlet", orientation: "portrait", width: 1240, height: 1754, pages: 4, multiPage: true },
  card: { name: "card", label: "Business card", orientation: "landscape", width: 1050, height: 600, pages: 1, multiPage: false },
};

/** Every format name, in display order — drives the Size menu in the studio menu bar. */
export const FORMAT_NAMES: readonly FormatName[] = [
  "social", "post", "story", "wide", "banner", "flyer", "pamphlet", "card",
];

export function isFormatName(value: string): value is FormatName {
  return (FORMAT_NAMES as readonly string[]).includes(value);
}

/** Look up a preset by name. Throws on an unknown format so a typo fails loudly, not silently. */
export function getFormatPreset(name: string): FormatPreset {
  if (!isFormatName(name)) {
    throw new Error(`Unknown studio format: ${name}`);
  }
  return FORMAT_PRESETS[name];
}

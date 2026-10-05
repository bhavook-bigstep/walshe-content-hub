/** Pure export helpers (AC12). Deterministic: no clock, no randomness. */
import type { FormatName } from "./formats";

export type ExportKind = "png" | "pdf" | "html";

const EXT: Readonly<Record<ExportKind, string>> = { png: "png", pdf: "pdf", html: "html" };

/** Download filename for a design, e.g. `walsh-social.png`; page (1-based) is appended for multi-page PNGs. */
export function filenameFor(format: FormatName, kind: ExportKind = "png", page?: number): string {
  const suffix = page !== undefined && page > 0 ? `-p${Math.floor(page)}` : "";
  return `walsh-${format}${suffix}.${EXT[kind]}`;
}

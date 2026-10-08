// Flatten a catalog entry's factual/text fields into labelled snippets. One source of truth shared by
// the Design Studio's left-drawer TEXT tab (each field is a placeable snippet) and the AI Builder's
// Content Moderation check (the corpus of facts the canvas copy is verified against). Pure +
// deterministic: same entry in → same ordered fields out.
import type { Entry } from "../api";

export interface EntryField {
  /** A short human label, e.g. "Title", "Highlight", "Valid until". */
  label: string;
  /** The factual text value. */
  value: string;
}

export interface EntryTextGroup {
  /** `entry-<id>` — stable across reloads. */
  id: string;
  entryId: number;
  title: string;
  /** Context line, e.g. "event · Galway". */
  subtitle: string;
  fields: EntryField[];
}

const SEASON_LABELS: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
  year_round: "Year-round",
};

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function locationLine(e: Entry): string {
  return [e.city, e.state, e.country]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function prettifyKey(k: string): string {
  return k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/** The entry's factual/text fields as labelled snippets, in a stable order, with empties dropped. */
export function entryTextFields(e: Entry): EntryField[] {
  const fields: EntryField[] = [];
  const push = (label: string, value?: string | null) => {
    const v = (value ?? "").trim();
    if (v) fields.push({ label, value: v });
  };

  push("Title", e.title);
  push("Description", e.description);
  push("Destination", e.destination);
  push("Location", locationLine(e));
  if (e.season) push("Season", SEASON_LABELS[e.season] ?? e.season);
  push("Valid from", formatDate(e.valid_from));
  push("Valid until", formatDate(e.expires_at));
  for (const h of e.highlights ?? []) push("Highlight", h);
  for (const s of e.custom_sections ?? []) {
    const title = (s.title ?? "").trim();
    push(title ? `Section · ${title}` : "Section", s.body);
  }
  for (const [k, raw] of Object.entries(e.attributes ?? {})) {
    if (raw == null) continue;
    const v =
      typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
        ? String(raw)
        : "";
    if (v) push(prettifyKey(k), v);
  }
  for (const it of e.items ?? []) {
    const t = (it.text ?? "").trim();
    if (t) push(it.title?.trim() ? `Item · ${it.title.trim()}` : "Item text", t);
  }
  return fields;
}

/** Group every entry's text fields under the entry they come from. */
export function entryTextGroups(entries: Entry[]): EntryTextGroup[] {
  return entries.map((e) => ({
    id: `entry-${e.id}`,
    entryId: e.id,
    title: e.title || "Untitled entry",
    subtitle: [e.type, e.destination].map((s) => (s ?? "").trim()).filter(Boolean).join(" · "),
    fields: entryTextFields(e),
  }));
}

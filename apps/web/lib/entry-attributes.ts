import type { TemplateField } from "./api";

// AC29 — helpers for the per-type structured attribute form. The fields themselves come from the
// backend (`GET /catalog/templates`, the single source of truth in app/content_templates.py); this
// module only turns the raw string inputs into stored values and formats them back for display, so
// the UI never hardcodes the field list and can't drift from the API.

// Coerce raw string inputs into the JSON-friendly values the API stores, dropping empties so a
// partially-filled form never writes blank attributes. "number" fields become numbers.
export function coerceAttributes(
  fields: TemplateField[],
  raw: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (raw[field.key] ?? "").trim();
    if (!value) continue;
    out[field.key] = field.type === "number" ? Number(value) : value;
  }
  return out;
}

// The HTML input type for a template field type.
export function inputType(fieldType: string): string {
  switch (fieldType) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "url":
      return "url";
    default:
      return "text";
  }
}

// Render a stored attribute value as human-readable text.
export function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

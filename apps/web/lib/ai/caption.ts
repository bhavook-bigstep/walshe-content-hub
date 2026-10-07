// Pure caption helpers for the AI "Generate caption / keywords" controls. No React, no I/O — so it
// is deterministic and unit-testable on its own.

/**
 * Append space-joined hashtags to a caption.
 *
 * - Tags already present in the caption (case-insensitive) are skipped, so repeated "Generate
 *   keywords" clicks don't pile up duplicates.
 * - Fresh tags are separated from existing text by a blank line; appending to an empty caption
 *   returns just the tag line.
 * - Blank/whitespace-only tags are ignored.
 */
export function appendHashtags(caption: string, hashtags: string[]): string {
  const present = new Set((caption.match(/#\w+/g) ?? []).map((t) => t.toLowerCase()));
  const seen = new Set<string>();
  const fresh: string[] = [];
  for (const raw of hashtags) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (present.has(key) || seen.has(key)) continue;
    seen.add(key);
    fresh.push(tag);
  }
  const line = fresh.join(" ");
  if (!line) return caption;
  const base = caption.trimEnd();
  return base ? `${base}\n\n${line}` : line;
}

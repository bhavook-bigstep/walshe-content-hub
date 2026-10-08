// Content moderation for the Design Studio (AC-grounding, Contract 1 + Contract 4). A pure,
// deterministic check that compares the factual copy on the canvas against the attached collection
// entries and flags anything that (a) contradicts an entry ("mismatch") or (b) isn't grounded in any
// entry at all ("unsourced"). Same inputs → same flags, so it's safe to re-run on every edit and to
// assert in tests. No network, no clock, no randomness.
import type { DesignDoc } from "./ops";
import type { EntryField } from "./entry-text";

/** The minimal entry shape the check needs (built from `entryTextFields`). */
export interface ModeratableEntry {
  id: number;
  title: string;
  fields: EntryField[];
}

export type FlagSeverity = "mismatch" | "unsourced";

export interface ModerationFlag {
  /** Deterministic: `<sceneId>:<nodeId>:<severity>`. */
  id: string;
  severity: FlagSeverity;
  sceneIndex: number;
  sceneId: string;
  nodeId: string;
  /** The canvas copy that triggered the flag (whitespace-collapsed, clipped). */
  text: string;
  /** Human explanation of the issue. */
  detail: string;
  /** The best-matching entry (for a mismatch). */
  entryTitle?: string;
}

// Common marketing/CTA filler that carries no factual claim — ignored when matching + when deciding
// whether a text node is "factual" enough to check.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "your", "our", "you",
  "is", "are", "at", "by", "now", "this", "that", "from", "it", "as", "be", "we", "us", "all",
  "book", "discover", "explore", "get", "see", "new", "more", "today", "here", "visit", "enjoy",
  "experience", "your",
]);

// Tuning knobs (kept named so the behaviour is legible + adjustable).
const MIN_FACTUAL_WORDS = 4; // a phrase this long is treated as a factual statement worth checking
const GROUNDED_RATIO = 0.5; // ≥ this share of a node's significant words found in the corpus = grounded
const MATCH_WORDS = 2; // ≥ this many shared significant words links a node to a specific entry

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function significantWords(s: string): Set<string> {
  return new Set(
    normalizeWords(s).filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w)),
  );
}

// Digit groups, tolerant of thousands separators + decimals ("€1,299.00" → "1299" and "1299.00").
function numbersIn(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const cleaned = raw.replace(/,/g, "");
    out.add(cleaned);
    out.add(cleaned.replace(/\.0+$/, "")); // normalise "450.00" ≈ "450"
  }
  return out;
}

function clip(s: string, n = 80): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

/**
 * Check the canvas copy against the collection entries. Returns the flags, most-serious first
 * (mismatch before unsourced), then in stable scene/node order. With no entries attached there is
 * nothing to check against, so it returns no flags.
 */
export function moderateWorkspace(design: DesignDoc, entries: ModeratableEntry[]): ModerationFlag[] {
  if (entries.length === 0) return [];

  const perEntry = entries.map((e) => {
    const text = e.fields.map((f) => f.value).join(" ");
    return { entry: e, words: significantWords(text), numbers: numbersIn(text) };
  });
  const corpusWords = new Set<string>();
  const corpusNumbers = new Set<string>();
  for (const pe of perEntry) {
    pe.words.forEach((w) => corpusWords.add(w));
    pe.numbers.forEach((n) => corpusNumbers.add(n));
  }

  const flags: ModerationFlag[] = [];
  design.scenes.forEach((scene, sceneIndex) => {
    for (const node of scene.nodes) {
      if (node.type !== "text") continue;
      const text = (node.text ?? "").trim();
      if (!text) continue;

      const words = [...significantWords(text)];
      const nums = [...numbersIn(text)];
      const factual = nums.length > 0 || normalizeWords(text).length >= MIN_FACTUAL_WORDS;
      if (!factual || (words.length === 0 && nums.length === 0)) continue;

      // Best-matching entry by shared significant words.
      let best: { title: string; numbers: Set<string>; shared: number } | null = null;
      for (const pe of perEntry) {
        let shared = 0;
        for (const w of words) if (pe.words.has(w)) shared += 1;
        if (!best || shared > best.shared) best = { title: pe.entry.title, numbers: pe.numbers, shared };
      }

      const foundWords = words.filter((w) => corpusWords.has(w)).length;
      const wordRatio = words.length ? foundWords / words.length : 1;

      // 1) Mismatch — the copy clearly refers to a specific entry (shared words) but states a figure
      //    that neither that entry nor any other entry contains.
      if (best && best.shared >= MATCH_WORDS) {
        const badNum = nums.find((n) => !best!.numbers.has(n) && !corpusNumbers.has(n));
        if (badNum) {
          flags.push({
            id: `${scene.id}:${node.id}:mismatch`,
            severity: "mismatch",
            sceneIndex,
            sceneId: scene.id,
            nodeId: node.id,
            text: clip(text),
            entryTitle: best.title,
            detail: `“${badNum}” doesn't appear in “${best.title}” — verify this figure against the collection.`,
          });
          continue;
        }
      }

      // 2) Unsourced — a factual statement not grounded in any collection entry (low word overlap, or
      //    it carries figures none of the entries have and it isn't tied to a specific entry).
      const numsUngrounded = nums.length > 0 && nums.every((n) => !corpusNumbers.has(n));
      if (wordRatio < GROUNDED_RATIO || (numsUngrounded && (!best || best.shared < MATCH_WORDS))) {
        flags.push({
          id: `${scene.id}:${node.id}:unsourced`,
          severity: "unsourced",
          sceneIndex,
          sceneId: scene.id,
          nodeId: node.id,
          text: clip(text),
          detail: "This copy isn't grounded in any collection entry — add it to the collection or correct the text.",
        });
      }
    }
  });

  const rank: Record<FlagSeverity, number> = { mismatch: 0, unsourced: 1 };
  return flags.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      a.sceneIndex - b.sceneIndex ||
      a.nodeId.localeCompare(b.nodeId),
  );
}

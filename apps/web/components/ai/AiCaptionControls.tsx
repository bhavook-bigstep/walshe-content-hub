"use client";

import { useEffect, useState } from "react";
import { generateCaption, generateKeywords } from "../../lib/api";
import { appendHashtags } from "../../lib/ai/caption";

// A playful status that cycles while the request is in flight — in the spirit of Claude Code's
// whimsical spinner. Purely cosmetic; the buttons stay disabled regardless of the word shown.
const SPINNER_WORDS = [
  "Grooving…",
  "Riffing…",
  "Dreaming up copy…",
  "Scheming hashtags…",
  "Vibing…",
  "Conjuring…",
];
const SPINNER_INTERVAL_MS = 450;

type Pending = "caption" | "keywords" | null;

/**
 * Controlled AI copy controls for the Studio publish composer. "Generate caption" replaces the
 * caption with an AI-written one; "Generate keywords" appends AI-suggested hashtags. Both are
 * disabled until a composition is saved (so there is content to ground on) or while a request runs.
 */
export default function AiCaptionControls({
  compositionId,
  caption,
  onCaptionChange,
}: {
  compositionId: number | null;
  caption: string;
  onCaptionChange: (next: string) => void;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [word, setWord] = useState(SPINNER_WORDS[0]);

  useEffect(() => {
    if (pending === null) return;
    let i = 0;
    setWord(SPINNER_WORDS[0]);
    const id = setInterval(() => {
      i = (i + 1) % SPINNER_WORDS.length;
      setWord(SPINNER_WORDS[i]);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pending]);

  const disabled = compositionId == null || pending !== null;

  async function onCaption() {
    if (compositionId == null) return;
    setPending("caption");
    setError(null);
    try {
      const { caption: next } = await generateCaption(compositionId);
      onCaptionChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a caption.");
    } finally {
      setPending(null);
    }
  }

  async function onKeywords() {
    if (compositionId == null) return;
    setPending("keywords");
    setError(null);
    try {
      const { hashtags } = await generateKeywords(compositionId);
      onCaptionChange(appendHashtags(caption, hashtags));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate keywords.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="AI copy">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled}
          aria-busy={pending === "caption"}
          onClick={() => void onCaption()}
        >
          {pending === "caption" ? word : "Generate caption"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled}
          aria-busy={pending === "keywords"}
          onClick={() => void onKeywords()}
        >
          {pending === "keywords" ? word : "Generate keywords"}
        </button>
      </div>
      <p className="text-small text-walshe-grey">
        Hashtags are AI-suggested from your content — give them a read before you post.
      </p>
      {error && (
        <span role="alert" className="text-small text-walshe-danger">
          {error}
        </span>
      )}
    </div>
  );
}

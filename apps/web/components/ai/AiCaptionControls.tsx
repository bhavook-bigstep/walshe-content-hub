"use client";

import { useState } from "react";
import { generateCaption, generateKeywords } from "../../lib/api";
import { appendHashtags } from "../../lib/ai/caption";

type Pending = "caption" | "keywords" | null;

// A playful, steady status while the model works: one word per action that stays put (no rapid
// word-switching), plus what it's actually doing — e.g. "Grooving — writing your caption…".
const STATUS: Record<"caption" | "keywords", { word: string; task: string }> = {
  caption: { word: "Grooving", task: "writing your caption" },
  keywords: { word: "Digging", task: "finding your hashtags" },
};

/**
 * Controlled AI copy controls for the publish composer. "Generate caption" replaces the caption
 * with an AI-written one; "Generate keywords" appends AI-suggested hashtags. The buttons keep
 * their own labels (disabled while a request runs); a single steady status + spinner shows progress.
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
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" disabled={disabled}
                aria-busy={pending === "caption"} onClick={() => void onCaption()}>
          Generate caption
        </button>
        <button type="button" className="btn-secondary" disabled={disabled}
                aria-busy={pending === "keywords"} onClick={() => void onKeywords()}>
          Generate keywords
        </button>
        {pending && (
          <span className="inline-flex items-center gap-1.5 text-small text-walshe-grey"
                role="status" aria-live="polite">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-walshe-line border-t-walshe-green"
              aria-hidden
            />
            <span className="animate-pulse font-semibold text-walshe-green">{STATUS[pending].word}</span>
            <span>— {STATUS[pending].task}…</span>
          </span>
        )}
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

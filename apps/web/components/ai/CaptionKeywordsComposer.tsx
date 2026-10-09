"use client";

import { useState } from "react";
import { appendHashtags } from "../../lib/ai/caption";
import { generateCaption, generateKeywords } from "../../lib/api";

type Pending = "caption" | "keywords" | null;

// A playful, steady status while the model works — one word that stays put, plus what it's doing.
const STATUS: Record<"caption" | "keywords", { word: string; task: string }> = {
  caption: { word: "Grooving", task: "writing your caption" },
  keywords: { word: "Digging", task: "finding your hashtags" },
};

/**
 * Two separate boxes — Caption and Keywords/hashtags — each with its own "Generate" button. While a
 * box generates, that textarea is disabled (greyed) with a spinner + status centered in the middle
 * of it; the other box stays usable. One AI call at a time. Grounded in the selected composition.
 */
export default function CaptionKeywordsComposer({
  compositionId,
  caption,
  onCaptionChange,
  keywords,
  onKeywordsChange,
}: {
  compositionId: number | null;
  caption: string;
  onCaptionChange: (next: string) => void;
  keywords: string;
  onKeywordsChange: (next: string) => void;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = compositionId == null || pending !== null;

  async function run(which: "caption" | "keywords", fn: (id: number) => Promise<void>) {
    if (compositionId == null) return;
    setPending(which);
    setError(null);
    try {
      await fn(compositionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not generate the ${which}.`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4" role="group" aria-label="AI copy">
      <CopyField
        label="Caption"
        value={caption}
        onChange={onCaptionChange}
        placeholder="Write a caption, or generate one from your content…"
        minHeightClass="min-h-24"
        loading={pending === "caption"}
        status={STATUS.caption}
        buttonLabel="Generate caption"
        buttonDisabled={disabled}
        onGenerate={() =>
          void run("caption", async (id) => {
            const { caption: next } = await generateCaption(id);
            onCaptionChange(next);
          })
        }
      />
      <CopyField
        label="Keywords / hashtags"
        value={keywords}
        onChange={onKeywordsChange}
        placeholder="Add hashtags, or generate them from your content…"
        minHeightClass="min-h-16"
        loading={pending === "keywords"}
        status={STATUS.keywords}
        buttonLabel="Generate keywords"
        buttonDisabled={disabled}
        onGenerate={() =>
          void run("keywords", async (id) => {
            const { hashtags } = await generateKeywords(id);
            onKeywordsChange(appendHashtags(keywords, hashtags));
          })
        }
      />
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

function CopyField({
  label,
  value,
  onChange,
  placeholder,
  minHeightClass,
  loading,
  status,
  buttonLabel,
  buttonDisabled,
  onGenerate,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  minHeightClass: string;
  loading: boolean;
  status: { word: string; task: string };
  buttonLabel: string;
  buttonDisabled: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label">{label}</span>
      <div className="relative">
        <textarea
          className={`field w-full resize-y ${minHeightClass} disabled:opacity-60`}
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading}
        />
        {/* Loading overlay, centered in the middle of this textarea (greys the box while it works). */}
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-md bg-walshe-stone/75"
            role="status"
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-2 text-small">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-walshe-line border-t-walshe-green"
                aria-hidden
              />
              <span className="animate-pulse font-semibold text-walshe-green">{status.word}</span>
              <span className="text-walshe-grey">— {status.task}…</span>
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn-secondary self-start"
        disabled={buttonDisabled}
        aria-busy={loading}
        onClick={onGenerate}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

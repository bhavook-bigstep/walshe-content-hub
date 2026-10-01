"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, publishSocialPost, scheduleSocialPost, type Post } from "../../../lib/api";

// Simulated connected channels (no real network integration in this PoC).
const CHANNELS: readonly string[] = ["facebook", "instagram", "x", "linkedin"];

type Mode = "schedule" | "publish";

export default function AgentSocialPage() {
  const [compositionId, setCompositionId] = useState("");
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  async function submit(mode: Mode) {
    setError(null);
    const id = Number(compositionId);
    if (!compositionId.trim() || !Number.isInteger(id) || id <= 0) {
      setError("Enter a valid composition id.");
      return;
    }
    setBusy(true);
    try {
      const post =
        mode === "publish"
          ? await publishSocialPost({ composition_id: id, channel })
          : await scheduleSocialPost({
              composition_id: id,
              channel,
              scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            });
      setPosts((p) => [post, ...p.filter((x) => x.id !== post.id)]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Could not ${mode} the post.`);
    } finally {
      setBusy(false);
    }
  }

  function onSchedule(e: FormEvent) {
    e.preventDefault();
    void submit("schedule");
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Social</h1>
        <Link href="/agent" className="text-sm underline">
          Agent home
        </Link>
      </div>
      <p className="text-sm text-slate-600">Schedule or publish a composition to a simulated connected channel.</p>

      <form onSubmit={onSchedule} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Composition id
          <input
            value={compositionId}
            onChange={(e) => setCompositionId(e.target.value)}
            inputMode="numeric"
            className="mt-1 block rounded border px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Channel
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="mt-1 block rounded border px-2 py-1"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Schedule at
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="mt-1 block rounded border px-2 py-1"
          />
        </label>
        <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-50">
          Schedule
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit("publish")}
          className="rounded border px-3 py-1 disabled:opacity-50"
        >
          Publish now
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <section aria-label="Posts">
        <h2 className="mb-2 font-medium">Posts</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-slate-500">No posts yet.</p>
        ) : (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded border p-3 text-sm">
                <span>
                  Composition #{p.composition_id} on {p.channel}
                  {p.status === "scheduled" && p.scheduled_at ? ` at ${p.scheduled_at}` : ""}
                  {p.status === "published" && p.published_at ? ` at ${p.published_at}` : ""}
                </span>
                <span data-testid="post-status" className="rounded bg-slate-100 px-2 py-0.5 font-medium">
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

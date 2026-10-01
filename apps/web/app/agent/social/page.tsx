"use client";

import { useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
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
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Social" }]}
        title="Social"
        description="Schedule or publish a composition to a simulated connected channel."
      />

      <form onSubmit={onSchedule} className="card mb-6 flex flex-wrap items-end gap-4 p-4">
        <label className="text-small">
          <span className="label">Composition id</span>
          <input
            value={compositionId}
            onChange={(e) => setCompositionId(e.target.value)}
            inputMode="numeric"
            className="field"
            placeholder="e.g. 1"
          />
        </label>
        <label className="text-small">
          <span className="label">Channel</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="field capitalize">
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-small">
          <span className="label">Schedule at</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="field"
          />
        </label>
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="btn-primary h-12">
            Schedule
          </button>
          <button type="button" disabled={busy} onClick={() => void submit("publish")} className="btn-secondary h-12">
            Publish now
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      <section aria-label="Posts">
        <h2 className="mb-4 text-h3 font-bold text-walshe-ink">Posts</h2>
        {posts.length === 0 ? (
          <div className="card p-8 text-center text-body text-walshe-grey">
            No posts yet. Schedule or publish a composition to see it here.
          </div>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id} className="card card-hover flex items-center justify-between gap-3 p-5 text-small">
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 flex-none rounded-pill ${p.status === "published" ? "bg-walshe-green" : "bg-walshe-teal"}`}
                  />
                  <span className="min-w-0 text-walshe-ink">
                    <span className="font-semibold">Composition #{p.composition_id}</span> on{" "}
                    <span className="capitalize">{p.channel}</span>
                    {p.status === "scheduled" && p.scheduled_at ? ` · scheduled ${new Date(p.scheduled_at).toLocaleString()}` : ""}
                    {p.status === "published" && p.published_at ? ` · published ${new Date(p.published_at).toLocaleString()}` : ""}
                  </span>
                </span>
                <span
                  data-testid="post-status"
                  className={`shrink-0 capitalize ${p.status === "published" ? "chip-verified" : "chip-draft"}`}
                >
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

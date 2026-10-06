"use client";

import { useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import {
  ApiError,
  listProjects,
  preflightSend,
  publishSocialPost,
  scheduleSocialPost,
  type Post,
  type Preflight,
  type Project,
} from "../../../lib/api";

// Simulated connected channels (no real network integration in this PoC).
const CHANNELS: readonly string[] = ["facebook", "instagram", "x", "linkedin"];

type Mode = "schedule" | "publish";

export default function AgentSocialPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [compositionId, setCompositionId] = useState("");
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [preflight, setPreflight] = useState<Preflight | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((p) => {
        if (cancelled) return;
        setProjects(p);
        if (p.length > 0) setCompositionId(String(p[0].id));
      })
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, []);

  function validId(): number | null {
    const id = Number(compositionId);
    return compositionId.trim() && Number.isInteger(id) && id > 0 ? id : null;
  }

  async function runCheck(id: number): Promise<Preflight> {
    setError(null);
    const result = await preflightSend(id, channel);
    setPreflight(result);
    return result;
  }

  function onRunCheck() {
    const id = validId();
    if (id === null) setError("Choose a composition first.");
    else void runCheck(id);
  }

  async function submit(mode: Mode) {
    const id = validId();
    if (id === null) {
      setError("Choose a composition first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // AC34: pre-send check first — don't attempt the send until it's clean.
      const check = await runCheck(id);
      if (!check.ok) {
        setError("This post isn’t ready to send yet — see the pre-send check below.");
        return;
      }
      const post =
        mode === "publish"
          ? await publishSocialPost({ composition_id: id, channel })
          : await scheduleSocialPost({
              composition_id: id,
              channel,
              scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            });
      setPosts((p) => [post, ...p.filter((x) => x.id !== post.id)]);
      setPreflight(null);
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
      />

      <form onSubmit={onSchedule} className="card mb-6 flex flex-wrap items-end gap-4 p-4">
        <label className="text-small" style={{ minWidth: "14rem" }}>
          <span className="label">Composition</span>
          <select
            value={compositionId}
            onChange={(e) => {
              setCompositionId(e.target.value);
              setPreflight(null);
            }}
            className="field"
            aria-label="Composition"
          >
            {projects === null && <option value="">Loading…</option>}
            {projects !== null && projects.length === 0 && <option value="">No saved compositions</option>}
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || `Composition #${p.id}`}
              </option>
            ))}
          </select>
        </label>
        <label className="text-small">
          <span className="label">Channel</span>
          <select
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
              setPreflight(null);
            }}
            className="field capitalize"
          >
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
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={onRunCheck} className="btn-ghost h-12">
            Run pre-send check
          </button>
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

      {/* Pre-send check result (AC34) — plain-word issues + how to fix each. */}
      {preflight && (
        <section
          data-testid="preflight-result"
          className={`card mb-6 p-5 ${preflight.ok ? "border-walshe-green/40" : "border-walshe-warn/50"}`}
        >
          {preflight.ok ? (
            <p className="flex items-center gap-2 text-small font-semibold text-walshe-green">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 13l4 4L19 7" />
              </svg>
              All checks passed — this post is ready to send.
            </p>
          ) : (
            <>
              <h2 className="mb-3 text-small font-bold uppercase tracking-[0.1em] text-walshe-warn">
                Fix before sending
              </h2>
              <ul data-testid="preflight-issues" className="space-y-3">
                {preflight.issues.map((issue, i) => (
                  <li key={i} className="rounded-md border border-walshe-line bg-walshe-stone/40 p-3">
                    <p className="text-small font-medium text-walshe-ink">{issue.message}</p>
                    <p className="mt-1 text-small text-walshe-grey">→ {issue.fix}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
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
                    className={`h-2.5 w-2.5 flex-none rounded-pill ${p.status === "published" ? "bg-walshe-green" : "bg-walshe-mint"}`}
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

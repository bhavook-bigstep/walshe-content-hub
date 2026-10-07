"use client";

import { useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import {
  ApiError,
  approveSocialPost,
  listProjects,
  listSocialPosts,
  preflightSend,
  rejectSocialPost,
  scheduleSocialPost,
  type Post,
  type Preflight,
  type Project,
} from "../../../lib/api";

// Simulated connected channels (no real network integration in this PoC).
const CHANNELS: readonly string[] = ["facebook", "instagram", "x", "linkedin"];

const STATUS_CHIP: Record<string, string> = {
  published: "chip-verified",
  pending_approval: "chip-draft",
  rejected: "chip-draft",
  draft: "chip-draft",
};

export default function AgentSocialPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [compositionId, setCompositionId] = useState("");
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((p) => {
        if (cancelled) return;
        setProjects(p);
        if (p.length > 0) setCompositionId(String(p[0].id));
      })
      .catch(() => !cancelled && setProjects([]));
    // Load existing posts from the server so the list survives a refresh (AC80).
    listSocialPosts()
      .then((p) => !cancelled && setPosts(p))
      .catch(() => !cancelled && setPosts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadPosts() {
    setPosts(await listSocialPosts().catch(() => posts ?? []));
  }

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

  async function onSchedule(e: FormEvent) {
    e.preventDefault();
    const id = validId();
    if (id === null) {
      setError("Choose a composition first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // AC34: pre-send check first — don't schedule until it's clean.
      const check = await runCheck(id);
      if (!check.ok) {
        setError("This post isn’t ready to send yet — see the pre-send check below.");
        return;
      }
      await scheduleSocialPost({
        composition_id: id,
        channel,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      setPreflight(null);
      await reloadPosts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not schedule the post.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setRejectingId(null);
      setRejectNote("");
      await reloadPosts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the post.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Social" }]}
        title="Social"
        description="Schedule a post for review — approving it sends it on the (simulated) channel."
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
            Schedule for approval
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
              All checks passed — schedule it for approval.
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
        {posts === null ? (
          <div className="card h-24 animate-pulse bg-walshe-stone/60" aria-hidden />
        ) : posts.length === 0 ? (
          <div className="card p-8 text-center text-body text-walshe-grey">
            No posts yet. Schedule a composition to see it here.
          </div>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id} className="card p-5 text-small">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0 text-walshe-ink">
                    <span className="font-semibold">{p.composition_name || `Composition #${p.composition_id}`}</span>
                    {" · "}
                    <span className="capitalize">{p.channel}</span>
                    {p.status === "pending_approval" && p.scheduled_at
                      ? ` · scheduled ${new Date(p.scheduled_at).toLocaleString()}`
                      : ""}
                    {p.status === "published" && p.published_at
                      ? ` · published ${new Date(p.published_at).toLocaleString()}`
                      : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      data-testid="post-status"
                      className={`shrink-0 capitalize ${STATUS_CHIP[p.status] ?? "chip-draft"}`}
                    >
                      {p.status.replace(/_/g, " ")}
                    </span>
                    {p.status === "pending_approval" && (
                      <>
                        <button type="button" className="btn-primary h-9" disabled={busy}
                                onClick={() => void runAction(() => approveSocialPost(p.id))}>
                          Approve &amp; send
                        </button>
                        <button type="button" className="btn-ghost h-9 text-walshe-danger" disabled={busy}
                                onClick={() => { setRejectingId(p.id); setRejectNote(""); }}>
                          Reject
                        </button>
                      </>
                    )}
                  </span>
                </div>
                {p.status === "rejected" && p.review_note && (
                  <p className="mt-2 text-walshe-danger">Rejected: {p.review_note}</p>
                )}
                {rejectingId === p.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-walshe-line pt-3">
                    <label className="flex-1" style={{ minWidth: "16rem" }}>
                      <span className="label">Reject reason (optional)</span>
                      <input className="field" aria-label="Reject reason" value={rejectNote}
                             onChange={(e) => setRejectNote(e.target.value)} />
                    </label>
                    <button type="button" className="btn-ghost h-10 text-walshe-danger" disabled={busy}
                            onClick={() => void runAction(() => rejectSocialPost(p.id, rejectNote))}>
                      Confirm reject
                    </button>
                    <button type="button" className="btn-ghost h-10" disabled={busy}
                            onClick={() => setRejectingId(null)}>Cancel</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

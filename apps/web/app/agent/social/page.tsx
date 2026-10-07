"use client";

import { useEffect, useState, type FormEvent } from "react";
import ConnectedPlatforms from "../../../components/social/ConnectedPlatforms";
import PageHeader from "../../../components/ui/PageHeader";
import Select from "../../../components/ui/Select";
import { relativeTime } from "../../../lib/social/timing";
import {
  ApiError,
  approveSocialPost,
  listProjects,
  listSocialPosts,
  me,
  preflightSend,
  rejectSocialPost,
  scheduleSocialPost,
  type Post,
  type Preflight,
  type Project,
  type User,
} from "../../../lib/api";

// Simulated connected channels (no real network integration in this PoC).
const CHANNELS: readonly string[] = ["facebook", "instagram", "x", "linkedin"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Label + chip per post status. `approved` = greenlit, posting at its scheduled time.
const STATUS_META: Record<string, { label: string; chip: string }> = {
  published: { label: "Published", chip: "chip-verified" },
  approved: { label: "Scheduled", chip: "chip-info" },
  pending_approval: { label: "Pending approval", chip: "chip-draft" },
  rejected: { label: "Rejected", chip: "chip-draft" },
  draft: { label: "Draft", chip: "chip-draft" },
};
const statusMeta = (s: string) => STATUS_META[s] ?? { label: s.replace(/_/g, " "), chip: "chip-draft" };

// One plain-word line about where the post is in its lifecycle (posted / posting-when).
function timingLine(p: Post, now: Date): string {
  if (p.status === "published" && p.published_at) return `Posted ${relativeTime(p.published_at, now)}`;
  if (p.status === "approved" && p.scheduled_at) return `Posts ${relativeTime(p.scheduled_at, now)}`;
  if (p.status === "pending_approval" && p.scheduled_at)
    return `Awaiting approval · scheduled for ${new Date(p.scheduled_at).toLocaleString()}`;
  if (p.status === "rejected") return "Sent back — edit and reschedule";
  return "";
}

type Tab = "posts" | "platforms";

export default function AgentSocialPage() {
  const [tab, setTab] = useState<Tab>("posts");
  const [user, setUser] = useState<User | null>(null);
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
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    me()
      .then((u) => !cancelled && setUser(u))
      .catch(() => undefined);
    listProjects()
      .then((p) => {
        if (cancelled) return;
        setProjects(p);
        if (p.length > 0) setCompositionId(String(p[0].id));
      })
      .catch(() => !cancelled && setProjects([]));
    // Load existing posts from the server so the list survives a refresh (AC99).
    listSocialPosts()
      .then((p) => !cancelled && setPosts(p))
      .catch(() => !cancelled && setPosts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // Org-scoped storage key for the connected-platforms illusion: everyone in the same tenant shares
  // one connection view on this device (a stand-in for the real org-shared integration).
  const orgKey = user?.tenant_id != null ? `tenant-${user.tenant_id}` : "default";

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

  const compositionOptions =
    projects?.map((p) => ({ value: String(p.id), label: p.name || `Composition #${p.id}` })) ?? [];
  const channelOptions = CHANNELS.map((c) => ({ value: c, label: cap(c) }));
  const now = new Date(); // for relative "posts in …" / "posted … ago" lines (client-only list)

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Social" }]}
        title="Social"
        description="Your organization's posts and connected accounts — approving a post sends it on the (simulated) channel."
      />

      {/* Tabs — the Social page reads like an organization workspace: its posts and the accounts the
          whole org is connected to. */}
      <div role="tablist" aria-label="Social sections" className="mb-6 flex gap-2">
        {(
          [
            ["posts", "Posts"],
            ["platforms", "Connected platforms"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-small font-semibold ${
              tab === key ? "bg-walshe-teal text-white" : "bg-walshe-ink/10 text-walshe-grey"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "platforms" ? (
        <ConnectedPlatforms orgKey={orgKey} />
      ) : (
        <>
          {/* overflow-visible overrides .card's overflow-hidden so the Select dropdowns (absolutely
              positioned below their field) aren't clipped by the composer card when expanded. */}
          <form onSubmit={onSchedule} className="card mb-6 flex flex-wrap items-end gap-4 overflow-visible p-4">
            <label className="text-small" style={{ minWidth: "14rem" }}>
              <span className="label">Composition</span>
              <Select
                value={compositionId}
                onChange={(v) => {
                  setCompositionId(v);
                  setPreflight(null);
                }}
                options={compositionOptions}
                placeholder={projects === null ? "Loading…" : "No saved compositions"}
                disabled={projects === null || compositionOptions.length === 0}
                aria-label="Composition"
              />
            </label>
            <label className="text-small" style={{ minWidth: "11rem" }}>
              <span className="label">Channel</span>
              <Select
                value={channel}
                onChange={(v) => {
                  setChannel(v);
                  setPreflight(null);
                }}
                options={channelOptions}
                aria-label="Channel"
              />
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
                {posts.map((p) => {
                  const meta = statusMeta(p.status);
                  const timing = timingLine(p, now);
                  const open = expandedId === p.id;
                  return (
                    <li key={p.id} className="card p-0 text-small" data-testid="social-post">
                      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                        {/* Clickable row — toggles the detail panel. */}
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          aria-expanded={open}
                          onClick={() => setExpandedId(open ? null : p.id)}
                        >
                          <svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                            className={`mt-0.5 flex-none text-walshe-grey transition-transform ${open ? "rotate-90" : ""}`}
                          >
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                          <span className="min-w-0">
                            <span className="font-semibold text-walshe-ink">
                              {p.composition_name || `Composition #${p.composition_id}`}
                            </span>
                            <span className="text-walshe-grey"> · {cap(p.channel)}</span>
                            {timing && <span className="block text-small text-walshe-grey">{timing}</span>}
                          </span>
                        </button>
                        <span className="flex items-center gap-3">
                          <span data-testid="post-status" className={`shrink-0 ${meta.chip}`}>
                            {meta.label}
                          </span>
                          {p.status === "pending_approval" && (
                            <>
                              <button type="button" className="btn-primary h-9" disabled={busy}
                                      onClick={() => void runAction(() => approveSocialPost(p.id))}>
                                Approve
                              </button>
                              <button type="button" className="btn-ghost h-9 text-walshe-danger" disabled={busy}
                                      onClick={() => { setRejectingId(p.id); setRejectNote(""); }}>
                                Reject
                              </button>
                            </>
                          )}
                        </span>
                      </div>

                      {open && (
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-walshe-line px-5 py-4 sm:grid-cols-3">
                          <Detail label="Status" value={meta.label} />
                          <Detail label="Channel" value={cap(p.channel)} />
                          <Detail
                            label={p.status === "published" ? "Posted" : "Scheduled for"}
                            value={
                              p.status === "published"
                                ? p.published_at ? new Date(p.published_at).toLocaleString() : "—"
                                : p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "—"
                            }
                          />
                          {p.external_id && <Detail label="Reference" value={p.external_id} />}
                          {p.status === "rejected" && p.review_note && (
                            <Detail label="Reason" value={p.review_note} />
                          )}
                        </dl>
                      )}

                      {p.status === "rejected" && p.review_note && !open && (
                        <p className="px-5 pb-4 text-walshe-danger">Sent back: {p.review_note}</p>
                      )}
                      {rejectingId === p.id && (
                        <div className="flex flex-wrap items-end gap-2 border-t border-walshe-line px-5 py-4">
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
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** One labelled field in a post's expanded detail panel. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-eyebrow uppercase tracking-wide text-walshe-grey">{label}</dt>
      <dd className="truncate text-walshe-ink">{value}</dd>
    </div>
  );
}

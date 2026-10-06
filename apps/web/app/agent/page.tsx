"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EngagementChart, { type ChartPoint, type ChartSeries } from "../../components/charts/EngagementChart";
import CatalogThumb from "../../components/catalog/CatalogThumb";
import PageHeader from "../../components/ui/PageHeader";
import StatTile from "../../components/ui/StatTile";
import {
  ApiError,
  listAgentCatalog,
  listEngagement,
  listSuggestions,
  type AssistantItem,
  type Engagement,
  type Entry,
} from "../../lib/api";
import { latestByPost, metricValue, sumMetric } from "../../lib/engagement/metrics";

type EntryWithImage = Entry & { image_key?: string | null };

const QUICK_LINKS = [
  { href: "/agent/catalog", title: "Browse catalog", body: "Search approved, brand-safe content" },
  { href: "/agent/studio", title: "Open Design Studio", body: "Compose pamphlets, posts and more" },
  { href: "/agent/social", title: "Plan social", body: "Schedule and publish to channels" },
  { href: "/agent/campaigns", title: "Plan campaigns", body: "Schedule posts across a calendar" },
  { href: "/agent/engagement", title: "View engagement", body: "Reach, interactions and more" },
];

const CHART_SERIES: ChartSeries[] = [
  { key: "reach", label: "Reach", color: "rgb(var(--walshe-ink))", marker: "circle" },
  { key: "total_interactions", label: "Interactions", color: "rgb(var(--walshe-green))", marker: "square" },
];

export default function AgentHomePage() {
  const [catalog, setCatalog] = useState<EntryWithImage[] | null>(null);
  const [engagement, setEngagement] = useState<Engagement[] | null>(null);
  const [suggestions, setSuggestions] = useState<AssistantItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listAgentCatalog(), listEngagement()])
      .then(([c, e]) => {
        if (!alive) return;
        setCatalog(c as EntryWithImage[]);
        setEngagement([...e].sort((a, b) => a.post_id - b.post_id));
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Could not load your dashboard."));
    listSuggestions()
      .then((s) => alive && setSuggestions(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const loading = catalog === null || engagement === null;
  const engData = (engagement ?? []) as unknown as Parameters<typeof latestByPost>[0];
  const reach = sumMetric(engData, "reach");
  const views = sumMetric(engData, "views");
  const interactions = sumMetric(engData, "total_interactions");
  const latest = latestByPost(engData);
  const points: ChartPoint[] = latest.map((r) => ({ label: `Post #${r.post_id}`, values: r.metrics ?? {} }));
  const topPosts = [...latest].sort(
    (a, b) => metricValue(b, "total_interactions") - metricValue(a, "total_interactions"),
  ).slice(0, 4);
  const maxEng = Math.max(1, ...topPosts.map((p) => metricValue(p, "total_interactions")));

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Overview" }]}
        title="Agent home"
        action={
          <Link href="/agent/studio" className="btn-primary">
            Open Design Studio
          </Link>
        }
      />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 bg-white/[0.06] p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      {/* Stat tiles */}
      <section aria-label="Key figures" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !error
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
            ))
          : (
            <>
              <StatTile label="Approved content" value={catalog?.length ?? 0} caption="Items available to you" />
              <StatTile label="Reach" value={reach.toLocaleString("en-US")} caption="Across published posts" />
              <StatTile label="Views" value={views.toLocaleString("en-US")} caption="Across published posts" />
              <StatTile label="Interactions" value={interactions.toLocaleString("en-US")} caption="Likes, comments, saves, shares" />
            </>
          )}
      </section>
      {!loading && (
        <p className="-mt-6 mb-8 text-small text-walshe-grey">
          Live Instagram metrics across your published posts — updated as engagement comes in.
        </p>
      )}

      {/* Suggested next posts (AC40) — content worth sending, so the agent never starts from blank. */}
      {suggestions.length > 0 && (
        <section className="mb-10" aria-labelledby="suggested-title">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">Suggested for you</p>
              <h2 id="suggested-title" className="mt-2 text-h3 font-bold text-walshe-ink">
                Worth sending next
              </h2>
            </div>
            <Link href="/agent/assistant" className="btn-ghost">
              Ask the assistant
            </Link>
          </div>
          <ul data-testid="suggestions" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.slice(0, 3).map((s) => (
              <li key={s.id} className="card card-hover p-5">
                <div className="eyebrow text-[11px] capitalize">
                  {s.type} · {s.destination}
                </div>
                <h3 className="mt-2 text-h3 text-[1.0625rem] text-walshe-ink">{s.title}</h3>
                <p className="mt-1 text-small text-walshe-mint">{s.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Chart */}
        <div>
          {loading && !error ? (
            <div className="card h-80 animate-pulse bg-walshe-stone/60" aria-hidden />
          ) : points.length === 0 ? (
            <section className="card flex h-full flex-col items-start justify-center gap-3 p-8">
              <h2 className="text-h3 font-bold text-walshe-ink">No engagement yet</h2>
              <p className="text-body text-walshe-grey">Publish a composition to start seeing reach and interactions.</p>
              <Link href="/agent/social" className="btn-secondary">
                Plan a post
              </Link>
            </section>
          ) : (
            <EngagementChart
              title="Reach & interactions by post"
              summary="Latest Instagram reach and interactions for each published post."
              series={CHART_SERIES}
              points={points}
            />
          )}
        </div>

        {/* Scorecard */}
        <section className="card p-5" aria-labelledby="scorecard-title">
          <h2 id="scorecard-title" className="mb-1 text-h3 font-bold text-walshe-ink">
            Top posts
          </h2>
          <p className="mb-4 text-small text-walshe-grey">Ranked by interactions.</p>
          {loading && !error ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-sm bg-walshe-stone/60" aria-hidden />
              ))}
            </div>
          ) : topPosts.length === 0 ? (
            <p className="text-body text-walshe-grey">No posts yet.</p>
          ) : (
            <ol className="space-y-3">
              {topPosts.map((p, i) => (
                <li key={p.post_id} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-walshe-teal text-[12px] font-extrabold text-white tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-small">
                      <span className="font-semibold text-walshe-ink">Post #{p.post_id}</span>
                      <span className="tabular-nums text-walshe-grey">
                        {metricValue(p, "total_interactions").toLocaleString("en-US")}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-pill bg-walshe-stone" aria-hidden>
                      <div
                        className="h-2 rounded-pill bg-walshe-mint"
                        style={{ width: `${Math.max(4, Math.round((metricValue(p, "total_interactions") / maxEng) * 100))}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Recent catalog */}
      <section className="mt-10" aria-labelledby="recent-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recent-title" className="text-h3 font-bold text-walshe-ink">
            Recent approved content
          </h2>
          <Link href="/agent/catalog" className="btn-ghost">
            View all
          </Link>
        </div>
        {loading && !error ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card h-64 animate-pulse bg-walshe-stone/60" aria-hidden />
            ))}
          </div>
        ) : catalog && catalog.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-body text-walshe-grey">No approved content matches your access yet.</p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(catalog ?? []).slice(0, 3).map((e) => (
              <li key={e.id} className="card card-hover group overflow-hidden">
                <div className="relative">
                  <CatalogThumb imageKey={e.cover_object_key || e.image_key || e.asset_keys?.[0]} alt={e.title} />
                  <span className="chip-verified absolute left-3.5 top-3.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--walshe-green))" strokeWidth="3" aria-hidden>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    Verified
                  </span>
                </div>
                <div className="p-5">
                  <div className="eyebrow text-[11px] capitalize">
                    {e.type} · {e.destination}
                  </div>
                  <h3 className="mt-2 truncate text-h3 text-walshe-ink">{e.title}</h3>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick links */}
      <section className="mt-10" aria-label="Quick actions">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((q) => (
            <Link key={q.href} href={q.href} className="card card-hover group block p-5">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-walshe-ink">{q.title}</span>
                <span aria-hidden className="text-walshe-mint transition-transform group-hover:translate-x-0.5">→</span>
              </span>
              <span className="mt-1 block text-small text-walshe-grey">{q.body}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

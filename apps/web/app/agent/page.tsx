"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EngagementChart, { type EngagementPoint } from "../../components/charts/EngagementChart";
import CatalogThumb from "../../components/catalog/CatalogThumb";
import PageHeader from "../../components/ui/PageHeader";
import StatTile from "../../components/ui/StatTile";
import { ApiError, listAgentCatalog, listEngagement, type Engagement, type Entry } from "../../lib/api";

type EntryWithImage = Entry & { image_key?: string | null };

const QUICK_LINKS = [
  { href: "/agent/catalog", title: "Browse catalog", body: "Search approved, brand-safe content" },
  { href: "/agent/studio", title: "Open Design Studio", body: "Compose pamphlets, posts and more" },
  { href: "/agent/social", title: "Plan social", body: "Schedule and publish to channels" },
  { href: "/agent/engagement", title: "View engagement", body: "Impressions, clicks and CTR" },
];

function sum(rows: Engagement[], key: "impressions" | "clicks" | "engagement"): number {
  return rows.reduce((t, r) => t + r[key], 0);
}

export default function AgentHomePage() {
  const [catalog, setCatalog] = useState<EntryWithImage[] | null>(null);
  const [engagement, setEngagement] = useState<Engagement[] | null>(null);
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
    return () => {
      alive = false;
    };
  }, []);

  const loading = catalog === null || engagement === null;
  const impressions = engagement ? sum(engagement, "impressions") : 0;
  const clicks = engagement ? sum(engagement, "clicks") : 0;
  const ctr = impressions > 0 ? `${((clicks / impressions) * 100).toFixed(1)}%` : "—";
  const points: EngagementPoint[] = (engagement ?? []).map((r) => ({
    label: `Post #${r.post_id}`,
    impressions: r.impressions,
    clicks: r.clicks,
    engagement: r.engagement,
  }));
  const topPosts = [...(engagement ?? [])].sort((a, b) => b.engagement - a.engagement).slice(0, 4);
  const maxEng = Math.max(1, ...topPosts.map((p) => p.engagement));

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Overview" }]}
        title="Agent home"
        description="Browse approved destination content and turn it into marketing assets."
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
              <StatTile label="Impressions" value={impressions.toLocaleString("en-US")} caption="Across published posts" />
              <StatTile label="Clicks" value={clicks.toLocaleString("en-US")} caption="Across published posts" />
              <StatTile label="Average CTR" value={ctr} caption="Clicks ÷ impressions" />
            </>
          )}
      </section>
      {!loading && (
        <p className="-mt-6 mb-8 text-small text-walshe-grey">Figures shown are seeded sample data.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Chart */}
        <div>
          {loading && !error ? (
            <div className="card h-80 animate-pulse bg-walshe-stone/60" aria-hidden />
          ) : points.length === 0 ? (
            <section className="card flex h-full flex-col items-start justify-center gap-3 p-8">
              <h2 className="text-h3 font-bold text-walshe-ink">No engagement yet</h2>
              <p className="text-body text-walshe-grey">Publish a composition to start seeing impressions and clicks.</p>
              <Link href="/agent/social" className="btn-secondary">
                Plan a post
              </Link>
            </section>
          ) : (
            <EngagementChart
              title="Engagement by post"
              summary="Impressions, engagement and clicks for each published post (seeded sample data)."
              points={points}
            />
          )}
        </div>

        {/* Scorecard */}
        <section className="card p-5" aria-labelledby="scorecard-title">
          <h2 id="scorecard-title" className="mb-1 text-h3 font-bold text-walshe-ink">
            Top posts
          </h2>
          <p className="mb-4 text-small text-walshe-grey">Ranked by total engagement.</p>
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
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-walshe-mint text-[12px] font-extrabold text-walshe-teal tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-small">
                      <span className="font-semibold text-walshe-ink">Post #{p.post_id}</span>
                      <span className="tabular-nums text-walshe-grey">{p.engagement.toLocaleString("en-US")}</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-pill bg-walshe-stone" aria-hidden>
                      <div
                        className="h-2 rounded-pill bg-walshe-mint"
                        style={{ width: `${Math.max(4, Math.round((p.engagement / maxEng) * 100))}%` }}
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
                  <CatalogThumb imageKey={e.image_key ?? e.asset_keys?.[0]} alt={e.title} />
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

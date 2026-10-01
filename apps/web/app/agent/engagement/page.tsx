"use client";

import { useEffect, useState } from "react";
import EngagementChart, { type EngagementPoint } from "../../../components/charts/EngagementChart";
import PageHeader from "../../../components/ui/PageHeader";
import StatTile from "../../../components/ui/StatTile";
import { ApiError, listEngagement, type Engagement } from "../../../lib/api";

function ctr(row: Engagement): string {
  return row.impressions > 0 ? `${((row.clicks / row.impressions) * 100).toFixed(1)}%` : "—";
}

export default function AgentEngagementPage() {
  const [rows, setRows] = useState<Engagement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listEngagement()
      .then((r) => alive && setRows([...r].sort((a, b) => a.post_id - b.post_id)))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Could not load engagement."));
    return () => {
      alive = false;
    };
  }, []);

  const loading = rows === null;
  const impressions = (rows ?? []).reduce((t, r) => t + r.impressions, 0);
  const clicks = (rows ?? []).reduce((t, r) => t + r.clicks, 0);
  const engagement = (rows ?? []).reduce((t, r) => t + r.engagement, 0);
  const avgCtr = impressions > 0 ? `${((clicks / impressions) * 100).toFixed(1)}%` : "—";
  const points: EngagementPoint[] = (rows ?? []).map((r) => ({
    label: `Post #${r.post_id}`,
    impressions: r.impressions,
    clicks: r.clicks,
    engagement: r.engagement,
  }));

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Engagement" }]}
        title="Engagement"
        description="Impressions, clicks and engagement for published posts (seeded sample data)."
      />

      {error && (
        <p role="alert" className="card border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      {!error && (
        <section aria-label="Totals" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
            ))
          ) : (
            <>
              <StatTile label="Impressions" value={impressions.toLocaleString("en-US")} />
              <StatTile label="Clicks" value={clicks.toLocaleString("en-US")} />
              <StatTile label="Engagement" value={engagement.toLocaleString("en-US")} />
              <StatTile label="Average CTR" value={avgCtr} />
            </>
          )}
        </section>
      )}

      {!error && !loading && rows.length === 0 && (
        <div className="card p-8 text-center text-body text-walshe-grey">No published posts yet.</div>
      )}

      {!error && !loading && rows.length > 0 && (
        <div className="space-y-6">
          <EngagementChart
            title="Engagement by post"
            summary="Each published post's impressions, engagement and clicks (seeded sample data)."
            points={points}
          />

          <section className="card p-5" aria-labelledby="eng-table-title">
            <h2 id="eng-table-title" className="mb-4 text-h3 font-bold text-walshe-ink">
              Per-post detail
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-small" data-testid="engagement-table">
                <thead>
                  <tr className="border-b border-white/15 text-left text-walshe-grey">
                    <th className="py-2 pr-4 font-medium">Post</th>
                    <th className="py-2 pr-4 font-medium">Impressions</th>
                    <th className="py-2 pr-4 font-medium">Clicks</th>
                    <th className="py-2 pr-4 font-medium">Engagement</th>
                    <th className="py-2 pr-4 font-medium">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.post_id} data-testid="engagement-row" className={i % 2 === 1 ? "bg-walshe-stone/40" : undefined}>
                      <td className="py-2 pr-4 text-walshe-ink">Post #{r.post_id}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.impressions.toLocaleString("en-US")}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.clicks.toLocaleString("en-US")}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.engagement.toLocaleString("en-US")}</td>
                      <td className="py-2 pr-4 tabular-nums">{ctr(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

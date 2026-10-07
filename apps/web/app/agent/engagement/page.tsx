"use client";

import { useCallback, useEffect, useState } from "react";
import EngagementChart, { type ChartPoint, type ChartSeries } from "../../../components/charts/EngagementChart";
import PageHeader from "../../../components/ui/PageHeader";
import StatTile from "../../../components/ui/StatTile";
import { ApiError, listEngagement, refreshEngagement, type Engagement } from "../../../lib/api";
import {
  byCampaign, byPlatform, latestByPost, metricsFor, metricValue, sumMetric,
  type EngagementGroup,
} from "../../../lib/engagement/metrics";

// Chart series: reach + interactions (non-colour-encoded via distinct markers).
const CHART_SERIES: ChartSeries[] = [
  { key: "reach", label: "Reach", color: "rgb(var(--walshe-ink))", marker: "circle" },
  { key: "total_interactions", label: "Interactions", color: "rgb(var(--walshe-green))", marker: "square" },
];
const TILE_KEYS = ["reach", "views", "total_interactions", "likes"];

export default function AgentEngagementPage() {
  const [rows, setRows] = useState<Engagement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    return listEngagement()
      .then((r) => setRows([...r]))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load engagement."));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const { synced } = await refreshEngagement();
      await load();
      setRefreshMsg(`Pulled fresh metrics for ${synced} post${synced === 1 ? "" : "s"}.`);
    } catch (e) {
      setRefreshMsg(e instanceof ApiError ? e.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  const loading = rows === null;
  const data = (rows ?? []) as unknown as Parameters<typeof latestByPost>[0];
  const latest = latestByPost(data);
  const tiles = metricsFor("instagram").filter((m) => TILE_KEYS.includes(m.key));
  const igMetrics = metricsFor("instagram");
  const platformGroups = byPlatform(data);
  const campaignGroups = byCampaign(data);
  const postLabel = (r: (typeof latest)[number]) =>
    (r as { composition_name?: string | null }).composition_name || `Post #${r.post_id}`;
  const points: ChartPoint[] = latest.map((r) => ({ id: r.post_id, label: postLabel(r), values: r.metrics ?? {} }));
  // Roll-ups render as the same grouped bar chart (reach + interactions), one bar per platform /
  // campaign — the chart's built-in "Show data table" toggle keeps the exact numbers one click away.
  const groupsToPoints = (groups: EngagementGroup[]): ChartPoint[] =>
    groups.map((g) => ({ id: g.label, label: g.label, values: g.metrics }));

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Engagement" }]}
        title="Engagement"
        description="Real Instagram metrics for your published posts, refreshed every 10 minutes."
        action={
          <button type="button" className="btn-primary" disabled={refreshing || loading} onClick={() => void onRefresh()}>
            {refreshing ? "Refreshing…" : "Refresh from Instagram"}
          </button>
        }
      />

      {refreshMsg && <p className="mb-4 text-small text-walshe-mint">{refreshMsg}</p>}
      {error && (
        <p role="alert" className="card border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      {!error && (
        <section aria-label="Totals" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
              ))
            : tiles.map((m) => (
                <StatTile key={m.key} label={m.label} value={sumMetric(data, m.key).toLocaleString("en-US")} />
              ))}
        </section>
      )}

      {!error && !loading && latest.length === 0 && (
        <div className="card p-8 text-center text-body text-walshe-grey">
          No published posts yet — publish from the Studio, then refresh.
        </div>
      )}

      {!error && !loading && latest.length > 0 && (
        <div className="space-y-6">
          <EngagementChart
            title="Reach & interactions by post"
            summary="Latest Instagram metrics per published post."
            series={CHART_SERIES}
            points={points}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <EngagementChart
              title="By platform"
              summary="Reach & interactions per platform."
              series={CHART_SERIES}
              points={groupsToPoints(platformGroups)}
            />
            <EngagementChart
              title="By campaign"
              summary="Reach & interactions per campaign."
              series={CHART_SERIES}
              points={groupsToPoints(campaignGroups)}
            />
          </div>

          <section className="card p-5" aria-labelledby="eng-table-title">
            <h2 id="eng-table-title" className="mb-4 text-h3 font-bold text-walshe-ink">
              Per-post detail
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-small" data-testid="engagement-table">
                <thead>
                  <tr className="border-b border-walshe-line text-left text-walshe-grey">
                    <th className="py-2 pr-4 font-medium">Project</th>
                    {igMetrics.map((m) => (
                      <th key={m.key} className="py-2 pr-4 font-medium">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {latest.map((r, i) => (
                    <tr key={r.post_id} data-testid="engagement-row" className={i % 2 === 1 ? "bg-walshe-stone/40" : undefined}>
                      <td className="py-2 pr-4 text-walshe-ink">
                        <div className="font-medium">{postLabel(r)}</div>
                        <div className="text-walshe-grey capitalize">
                          {(r as { campaign_name?: string | null }).campaign_name
                            ? `${(r as { campaign_name?: string | null }).campaign_name} · ${r.platform}`
                            : r.platform}
                        </div>
                      </td>
                      {igMetrics.map((m) => (
                        <td key={m.key} className="py-2 pr-4 tabular-nums">
                          {metricValue(r, m.key).toLocaleString("en-US")}
                        </td>
                      ))}
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

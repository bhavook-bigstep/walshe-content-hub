"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import StatTile from "../../../components/ui/StatTile";
import EngagementChart, { type ChartPoint, type ChartSeries } from "../../../components/charts/EngagementChart";
import { getPerformance, ApiError, type Performance } from "../../../lib/api";

// Provider content performance (AC29): how agents use this provider's content across the trade —
// uses, reach (impressions) and engagements (likes/comments/saves/shares) on the posts built from it.
function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

// Compact line icons for the KPI tiles.
const UsesIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" /></svg>);
const ReachIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>);
const EngIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z" /></svg>);
const RateIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 5 5 19M6.5 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" /></svg>);

export default function ProviderPerformancePage() {
  const [data, setData] = useState<Performance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await getPerformance());
    } catch (e) {
      setError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = data === null && error === null;
  const rows = data?.rows ?? [];
  const totalReach = data?.total_reach ?? 0;
  const totalEng = data?.total_engagements ?? 0;
  const engRate = pct(totalEng, totalReach);
  const contentInUse = rows.filter((r) => r.uses > 0).length;
  const top = rows[0];
  const maxReach = Math.max(1, ...rows.map((r) => r.reach));

  // Top entries (those with any reach/engagement) for the bar chart — reach + engagements side by
  // side per entry, newest-first by reach. Capped so the x-axis stays legible.
  const chartRows = rows.filter((r) => r.reach > 0 || r.engagements > 0).slice(0, 8);
  const chartPoints: ChartPoint[] = chartRows.map((r) => ({
    label: r.title.length > 12 ? `${r.title.slice(0, 11)}…` : r.title,
    values: { reach: r.reach, engagements: r.engagements },
  }));
  const chartSeries: ChartSeries[] = [
    { key: "reach", label: "Reach", color: "rgb(var(--walshe-teal))", marker: "square" },
    { key: "engagements", label: "Engagements", color: "rgb(var(--walshe-gold))", marker: "circle" },
  ];

  return (
    <div>
      {error ? (
        <div role="alert" className="card flex flex-col items-center gap-4 border-walshe-danger/30 p-10 text-center">
          <p className="text-body text-walshe-danger">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
            ))}
          </div>
          <div className="card h-56 animate-pulse bg-walshe-stone/60" aria-hidden />
        </>
      ) : (
        <>
          {/* KPIs */}
          <section aria-label="Totals" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total uses" value={data!.total_uses.toLocaleString()} caption={`${contentInUse} of ${rows.length} entries in use`} icon={<UsesIcon />} />
            <StatTile label="Total reach" value={totalReach.toLocaleString()} caption="Impressions from agent posts" icon={<ReachIcon />} />
            <StatTile label="Engagements" value={totalEng.toLocaleString()} caption="Likes, comments, saves & shares" icon={<EngIcon />} />
            <StatTile label="Engagement rate" value={`${engRate.toFixed(1)}%`} caption="Engagements ÷ reach" icon={<RateIcon />} />
          </section>

          {/* Top performer highlight */}
          {top && top.reach > 0 && (
            <Link
              href={`/provider/catalog/${top.entry_id}`}
              className="card card-hover mb-8 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="eyebrow mb-1.5">Top performer</p>
                <p className="truncate text-h3 text-walshe-ink">{top.title}</p>
                <p className="mt-1 text-small text-walshe-grey">Your most-seen content this period</p>
              </div>
              <div className="flex flex-none gap-8">
                {[
                  ["Reach", top.reach.toLocaleString()],
                  ["Engagements", top.engagements.toLocaleString()],
                  ["Uses", String(top.uses)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[22px] font-extrabold tabular-nums text-walshe-ink">{v}</div>
                    <div className="text-small text-walshe-grey">{k}</div>
                  </div>
                ))}
              </div>
            </Link>
          )}

          {/* Bar chart — reach + engagements for the top entries (categorical, so bars). */}
          {chartPoints.length > 0 && (
            <div className="mb-8">
              <EngagementChart
                title="Reach & engagements by content"
                summary="Your top entries by reach, with the engagement each one earned. Toggle to the data table for exact figures."
                points={chartPoints}
                series={chartSeries}
              />
            </div>
          )}

          {/* Per-entry table */}
          {rows.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 p-10 text-center">
              <h3 className="text-h3 text-walshe-ink">No performance data yet</h3>
              <p className="max-w-md text-body text-walshe-grey">
                Once agents publish posts built from your content, their reach and engagement show up here.
              </p>
            </div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-left text-small">
                <thead>
                  <tr className="border-b border-walshe-line bg-walshe-mist/60 text-[11px] font-bold uppercase tracking-[0.1em] text-walshe-grey">
                    <th className="px-5 py-3.5 w-10">#</th>
                    <th className="px-5 py-3.5">Content</th>
                    <th className="px-5 py-3.5 text-right">Uses</th>
                    <th className="px-5 py-3.5">Reach</th>
                    <th className="px-5 py-3.5 text-right">Engagements</th>
                    <th className="px-5 py-3.5 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.entry_id} className="border-b border-walshe-line/70 last:border-0 transition-colors hover:bg-walshe-ink/5">
                      <td className="px-5 py-3.5 tabular-nums text-walshe-grey">{i + 1}</td>
                      <td className="px-5 py-3.5">
                        <Link href={`/provider/catalog/${r.entry_id}`} className="font-medium text-walshe-ink hover:text-walshe-teal">
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-walshe-grey">{r.uses}</td>
                      <td className="px-5 py-3.5">
                        <span className="tabular-nums text-walshe-ink">{r.reach.toLocaleString()}</span>
                        <div className="mt-1.5 h-1 rounded bg-walshe-stone" aria-hidden>
                          <div className="h-full rounded bg-walshe-mint" style={{ width: `${pct(r.reach, maxReach)}%` }} />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-walshe-grey">{r.engagements.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-walshe-grey">
                        {r.reach > 0 ? `${pct(r.engagements, r.reach).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import StatTile from "../../../components/ui/StatTile";
import Dialog from "../../../components/ui/Dialog";
import EngagementChart, { type ChartPoint, type ChartSeries } from "../../../components/charts/EngagementChart";
import TrendChart from "../../../components/charts/TrendChart";
import { getPerformance, ApiError, type Performance } from "../../../lib/api";

// Provider content performance (AC29): how agents use this provider's content — uses, reach
// (impressions) and engagements (likes/comments/saves/shares) on the posts built from it, over time.
function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const UsesIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" /></svg>);
const ReachIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>);
const EngIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z" /></svg>);
const RateIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 5 5 19M6.5 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" /></svg>);

export default function ProviderPerformancePage() {
  const [data, setData] = useState<Performance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

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
  const trend = data?.trend ?? [];
  const ranked = rows.filter((r) => r.reach > 0 || r.engagements > 0);
  const top3 = ranked.slice(0, 3);

  // Line chart: reach + engagements over time.
  const trendPoints: ChartPoint[] = trend.map((t) => ({
    label: fmtDate(t.date),
    values: { reach: t.reach, engagements: t.engagements },
  }));
  const trendSeries: ChartSeries[] = [
    { key: "reach", label: "Reach", color: "rgb(var(--walshe-teal))", marker: "circle" },
    { key: "engagements", label: "Engagements", color: "rgb(var(--walshe-gold))", marker: "square" },
  ];
  // Bar chart: reach by content (single series — clean, properly scaled).
  const barPoints: ChartPoint[] = ranked.slice(0, 8).map((r) => ({
    label: trunc(r.title, 12),
    values: { reach: r.reach },
  }));
  const barSeries: ChartSeries[] = [
    { key: "reach", label: "Reach", color: "rgb(var(--walshe-teal))", marker: "square" },
  ];

  return (
    <div>
      {error ? (
        <div role="alert" className="card flex flex-col items-center gap-4 border-walshe-danger/30 p-10 text-center">
          <p className="text-body text-walshe-danger">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Try again</button>
        </div>
      ) : loading ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card h-72 animate-pulse bg-walshe-stone/60" aria-hidden />
            <div className="card h-72 animate-pulse bg-walshe-stone/60" aria-hidden />
          </div>
        </>
      ) : (
        <>
          {/* KPIs */}
          <section aria-label="Totals" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total uses" value={data!.total_uses.toLocaleString()} caption={`${ranked.length} of ${rows.length} entries in use`} icon={<UsesIcon />} />
            <StatTile label="Total reach" value={totalReach.toLocaleString()} caption="Impressions from agent posts" icon={<ReachIcon />} />
            <StatTile label="Engagements" value={totalEng.toLocaleString()} caption="Likes, comments, saves & shares" icon={<EngIcon />} />
            <StatTile label="Engagement rate" value={`${pct(totalEng, totalReach).toFixed(1)}%`} caption="Engagements ÷ reach" icon={<RateIcon />} />
          </section>

          {rows.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 p-10 text-center">
              <h3 className="text-h3 text-walshe-ink">No performance data yet</h3>
              <p className="max-w-md text-body text-walshe-grey">
                Once agents publish posts built from your content, their reach and engagement show up here.
              </p>
            </div>
          ) : (
            <>
              {/* Charts: trend line + reach-by-content bars */}
              <div className="mb-8 grid gap-6 lg:grid-cols-2">
                {trendPoints.length > 1 && (
                  <TrendChart
                    title="Reach & engagements over time"
                    summary="Weekly totals across the posts built from your content."
                    points={trendPoints}
                    series={trendSeries}
                  />
                )}
                {barPoints.length > 0 && (
                  <EngagementChart
                    title="Reach by content"
                    summary="Your top entries by the reach of the posts that use them."
                    points={barPoints}
                    series={barSeries}
                  />
                )}
              </div>

              {/* Top performers + load-more */}
              <section aria-label="Top performers">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-h3 text-walshe-ink">Top performers</h2>
                  {ranked.length > 3 && (
                    <button type="button" className="btn-secondary" onClick={() => setListOpen(true)}>
                      Load more
                    </button>
                  )}
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {top3.map((r, i) => (
                    <Link key={r.entry_id} href={`/provider/catalog/${r.entry_id}`} className="card card-hover flex flex-col p-5">
                      <div className="flex items-center justify-between">
                        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-walshe-teal/10 text-small font-bold text-walshe-teal">{i + 1}</span>
                        <span className="rounded-pill bg-walshe-stone/60 px-2.5 py-0.5 text-[11px] font-semibold text-walshe-ink">
                          {r.reach > 0 ? `${pct(r.engagements, r.reach).toFixed(1)}%` : "—"} eng. rate
                        </span>
                      </div>
                      <h3 className="mt-3 truncate text-[1.0625rem] font-medium text-walshe-ink">{r.title}</h3>
                      <div className="mt-4 flex gap-6">
                        <div>
                          <div className="text-[22px] font-extrabold tabular-nums text-walshe-ink">{r.reach.toLocaleString()}</div>
                          <div className="text-small text-walshe-grey">Reach</div>
                        </div>
                        <div>
                          <div className="text-[22px] font-extrabold tabular-nums text-walshe-ink">{r.engagements.toLocaleString()}</div>
                          <div className="text-small text-walshe-grey">Engagements</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* Full ranked list in a modal. */}
      <Dialog title="All content performance" open={listOpen} onClose={() => setListOpen(false)}>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-left text-small">
            <thead className="sticky top-0 bg-walshe-paper">
              <tr className="border-b border-walshe-line text-[11px] font-bold uppercase tracking-[0.1em] text-walshe-grey">
                <th className="py-2.5 pr-3 w-8">#</th>
                <th className="py-2.5 pr-3">Content</th>
                <th className="py-2.5 pr-3 text-right">Uses</th>
                <th className="py-2.5 pr-3 text-right">Reach</th>
                <th className="py-2.5 pr-3 text-right">Engagements</th>
                <th className="py-2.5 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.entry_id} className="border-b border-walshe-line/70 last:border-0">
                  <td className="py-2.5 pr-3 tabular-nums text-walshe-grey">{i + 1}</td>
                  <td className="py-2.5 pr-3">
                    <Link href={`/provider/catalog/${r.entry_id}`} className="font-medium text-walshe-ink hover:text-walshe-teal">{r.title}</Link>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-walshe-grey">{r.uses}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-walshe-ink">{r.reach.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-walshe-grey">{r.engagements.toLocaleString()}</td>
                  <td className="py-2.5 text-right tabular-nums text-walshe-grey">{r.reach > 0 ? `${pct(r.engagements, r.reach).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>
    </div>
  );
}

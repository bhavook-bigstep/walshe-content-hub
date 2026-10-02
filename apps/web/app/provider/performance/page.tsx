"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import StatTile from "../../../components/ui/StatTile";
import { getPerformance, ApiError, type Performance } from "../../../lib/api";

// Provider content performance (AC29): how agents use this provider's content across the trade.
function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

export default function ProviderPerformancePage() {
  const [data, setData] = useState<Performance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
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
  const maxReach = data ? Math.max(1, ...data.rows.map((r) => r.reach)) : 1;

  return (
    <div>
      <PageHeader
        title="Performance"
        description="How agents use your content across the trade."
      />

      {error ? (
        <div role="alert" className="card border-walshe-danger/30 p-8 text-center text-walshe-danger">
          {error}
        </div>
      ) : loading ? (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
            ))}
          </div>
          <div className="card h-48 animate-pulse bg-walshe-stone/60" aria-hidden />
        </>
      ) : (
        <>
          <section aria-label="Totals" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile label="Total uses" value={data!.total_uses} caption="Across agent compositions" />
            <StatTile
              label="Total reach"
              value={data!.total_reach.toLocaleString()}
              caption="Impressions from agent posts"
            />
          </section>

          {data!.rows.length === 0 ? (
            <div className="card p-8 text-center text-walshe-grey">No performance data yet.</div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-left text-small">
                <thead>
                  <tr className="border-b border-walshe-line bg-walshe-mist/60 text-walshe-grey">
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">Content</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">Uses</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">Reach</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.rows.map((r) => (
                    <tr
                      key={r.entry_id}
                      className="border-b border-walshe-line/70 last:border-0 transition-colors hover:bg-white/5"
                    >
                      <td className="px-5 py-3.5 font-medium text-walshe-ink">{r.title}</td>
                      <td className="px-5 py-3.5 text-walshe-grey tabular-nums">{r.uses}</td>
                      <td className="px-5 py-3.5">
                        <span className="tabular-nums text-walshe-ink">{r.reach.toLocaleString()}</span>
                        <div
                          className="mt-1.5 h-1 rounded bg-walshe-mint/70"
                          style={{ width: `${(r.reach / maxReach) * 100}%` }}
                          aria-hidden
                        />
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, listEngagement, type Engagement } from "../../../lib/api";

// Categorical palette (colour-blind-safe, distinct hue + lightness); each metric keeps one colour.
const METRICS = [
  { key: "impressions", label: "Impressions", color: "#2563eb" },
  { key: "clicks", label: "Clicks", color: "#d97706" },
  { key: "engagement", label: "Engagement", color: "#0f766e" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

function barWidth(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "0%";
  return `${Math.max(2, Math.round((value / max) * 100))}%`;
}

function ctr(row: Engagement): string {
  return row.impressions > 0 ? `${((row.clicks / row.impressions) * 100).toFixed(1)}%` : "-";
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

  const max: Record<MetricKey, number> = { impressions: 0, clicks: 0, engagement: 0 };
  for (const r of rows ?? []) for (const m of METRICS) max[m.key] = Math.max(max[m.key], r[m.key]);

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Engagement</h1>
        <Link href="/agent" className="text-sm underline">
          Agent home
        </Link>
      </div>
      <p className="text-sm text-slate-600">Impressions, clicks and engagement for published posts (seeded data).</p>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!error && rows === null && <p className="text-sm text-slate-500">Loading...</p>}
      {rows !== null && rows.length === 0 && <p className="text-sm text-slate-500">No published posts yet.</p>}

      {rows !== null && rows.length > 0 && (
        <>
          <ul className="flex gap-4 text-xs" aria-label="Legend">
            {METRICS.map((m) => (
              <li key={m.key} className="flex items-center gap-1">
                <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: m.color }} />
                {m.label}
              </li>
            ))}
          </ul>
          <table className="w-full text-sm" data-testid="engagement-table">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Post</th>
                {METRICS.map((m) => (
                  <th key={m.key} className="py-2">
                    {m.label}
                  </th>
                ))}
                <th className="py-2">CTR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.post_id} data-testid="engagement-row" className="border-b align-top">
                  <td className="py-2">Post #{r.post_id}</td>
                  {METRICS.map((m) => (
                    <td key={m.key} className="py-2">
                      <div className="tabular-nums">{r[m.key].toLocaleString("en-US")}</div>
                      <div className="mt-1 h-1.5 w-32 rounded bg-slate-100" aria-hidden>
                        <div
                          className="h-1.5 rounded"
                          style={{ width: barWidth(r[m.key], max[m.key]), background: m.color }}
                        />
                      </div>
                    </td>
                  ))}
                  <td className="py-2 tabular-nums">{ctr(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}

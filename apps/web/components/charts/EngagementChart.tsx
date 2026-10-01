"use client";

import { useId, useState } from "react";

export interface EngagementPoint {
  label: string; // x-axis category (e.g. "Post #1")
  impressions: number;
  clicks: number;
  engagement: number;
}

// Chart series order per brief §3: teal, green, grey. Each series keeps one colour AND a distinct
// marker shape, so it never relies on colour alone (WCAG non-colour encoding).
const SERIES = [
  { key: "impressions", label: "Impressions", color: "var(--walshe-teal)", marker: "circle" },
  { key: "engagement", label: "Engagement", color: "var(--walshe-green)", marker: "square" },
  { key: "clicks", label: "Clicks", color: "var(--walshe-grey)", marker: "triangle" },
] as const;

type Key = (typeof SERIES)[number]["key"];

const W = 640;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 36, left: 48 };

function marker(shape: string, x: number, y: number, color: string) {
  if (shape === "square") return <rect x={x - 3.5} y={y - 3.5} width={7} height={7} fill={color} />;
  if (shape === "triangle")
    return <polygon points={`${x},${y - 4.5} ${x + 4},${y + 3.5} ${x - 4},${y + 3.5}`} fill={color} />;
  return <circle cx={x} cy={y} r={3.5} fill={color} />;
}

export default function EngagementChart({
  points,
  title,
  summary,
}: {
  points: EngagementPoint[];
  title: string;
  summary: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  const max = Math.max(1, ...points.flatMap((p) => [p.impressions, p.clicks, p.engagement]));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section className="card p-5" aria-labelledby={titleId}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-h3 font-bold text-walshe-ink">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="btn-secondary"
          aria-pressed={showTable}
        >
          {showTable ? "Show chart" : "Show data table"}
        </button>
      </div>
      <p className="mb-4 max-w-2xl text-small text-walshe-grey">{summary}</p>

      {/* Legend: each series is named in text AND carries a distinct marker shape (not colour
          alone), each shown as a stone-bordered chip for a visible, labelled key (WCAG non-colour
          encoding; ink-on-white ≈ 15:1). */}
      <ul className="mb-3 flex flex-wrap gap-2 text-small font-medium text-walshe-ink" aria-hidden={showTable}>
        {SERIES.map((s) => (
          <li
            key={s.key}
            className="inline-flex items-center gap-2 rounded-pill border border-walshe-stone bg-walshe-white px-3 py-1"
          >
            <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden>
              {marker(s.marker, 0, 0, s.color)}
            </svg>
            {s.label}
          </li>
        ))}
      </ul>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-small" data-testid="engagement-chart-table">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr className="border-b border-walshe-stone text-left text-walshe-grey">
                <th className="py-2 pr-4 font-medium">Post</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-2 pr-4 font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.label} className="border-b border-walshe-stone/60">
                  <td className="py-2 pr-4">{p.label}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="py-2 pr-4 tabular-nums">
                      {p[s.key as Key].toLocaleString("en-US")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${title}. ${summary}`}
          data-testid="engagement-chart"
        >
          {/* gridlines + y labels */}
          {gridLines.map((g) => {
            const gy = PAD.top + plotH - g * plotH;
            return (
              <g key={g}>
                <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke="var(--walshe-stone)" strokeWidth={1} />
                <text x={PAD.left - 8} y={gy + 4} textAnchor="end" fontSize="11" fill="var(--walshe-grey)">
                  {Math.round(g * max).toLocaleString("en-US")}
                </text>
              </g>
            );
          })}
          {/* x labels */}
          {points.map((p, i) => (
            <text key={p.label} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--walshe-grey)">
              {p.label.replace("Post ", "")}
            </text>
          ))}
          {/* series */}
          {SERIES.map((s) => {
            const pts = points.map((p, i) => `${x(i)},${y(p[s.key as Key])}`).join(" ");
            return (
              <g key={s.key}>
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} />
                {points.map((p, i) => (
                  <g key={p.label}>{marker(s.marker, x(i), y(p[s.key as Key]), s.color)}</g>
                ))}
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}

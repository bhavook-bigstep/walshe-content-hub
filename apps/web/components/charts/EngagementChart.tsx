"use client";

import { useId, useState } from "react";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  marker: "circle" | "square" | "triangle";
}

export interface ChartPoint {
  label: string; // x-axis category (e.g. "Post #1")
  values: Record<string, number>; // metric key -> value
}

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
  series,
  title,
  summary,
}: {
  points: ChartPoint[];
  series: ChartSeries[];
  title: string;
  summary: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  const val = (p: ChartPoint, key: string) => p.values[key] ?? 0;
  const max = Math.max(1, ...points.flatMap((p) => series.map((s) => val(p, s.key))));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  // Grouped bars: posts are categories (identity + magnitude), NOT a time series — so bars, not a
  // connecting line (which read as a trend/decline). One shared y-axis (no dual axis).
  const slotW = plotW / Math.max(1, points.length);
  const groupW = slotW * 0.62;
  const barGap = 2; // 2px surface gap between adjacent bars (dataviz marks spec)
  const barW = Math.max(6, (groupW - barGap * (series.length - 1)) / series.length);
  const slotCenter = (i: number) => PAD.left + (i + 0.5) * slotW;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section className="card p-5" aria-labelledby={titleId}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-h3 font-bold text-walshe-ink">
          {title}
        </h2>
        <button type="button" onClick={() => setShowTable((v) => !v)} className="btn-secondary" aria-pressed={showTable}>
          {showTable ? "Show chart" : "Show data table"}
        </button>
      </div>
      <p className="mb-4 max-w-2xl text-small text-walshe-grey">{summary}</p>

      <ul className="mb-3 flex flex-wrap gap-2 text-small font-medium text-walshe-ink" aria-hidden={showTable}>
        {series.map((s) => (
          <li
            key={s.key}
            className="inline-flex items-center gap-2 rounded-pill border border-walshe-line bg-walshe-stone/50 px-3 py-1"
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
              <tr className="border-b border-walshe-line text-left text-walshe-grey">
                <th className="py-2 pr-4 font-medium">Post</th>
                {series.map((s) => (
                  <th key={s.key} className="py-2 pr-4 font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.label} className="border-b border-walshe-line/60">
                  <td className="py-2 pr-4">{p.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-2 pr-4 tabular-nums">
                      {val(p, s.key).toLocaleString("en-US")}
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
          {gridLines.map((g) => {
            const gy = PAD.top + plotH - g * plotH;
            return (
              <g key={g}>
                <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke="rgb(var(--walshe-line))" strokeWidth={1} />
                <text x={PAD.left - 8} y={gy + 4} textAnchor="end" fontSize="11" fill="rgb(var(--walshe-grey))">
                  {Math.round(g * max).toLocaleString("en-US")}
                </text>
              </g>
            );
          })}
          {points.map((p, i) => (
            <text key={p.label} x={slotCenter(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="rgb(var(--walshe-grey))">
              {p.label}
            </text>
          ))}
          {points.map((p, i) => {
            const groupStart = slotCenter(i) - groupW / 2;
            return (
              <g key={p.label}>
                {series.map((s, j) => {
                  const v = val(p, s.key);
                  const bx = groupStart + j * (barW + barGap);
                  const by = y(v);
                  const bh = Math.max(0, PAD.top + plotH - by);
                  return (
                    <g key={s.key}>
                      <rect x={bx} y={by} width={barW} height={bh} rx={3} fill={s.color}>
                        <title>{`${p.label} · ${s.label}: ${v.toLocaleString("en-US")}`}</title>
                      </rect>
                      {v > 0 && (
                        <text
                          x={bx + barW / 2}
                          y={by - 4}
                          textAnchor="middle"
                          fontSize="10"
                          fill="rgb(var(--walshe-ink))"
                          className="tabular-nums"
                        >
                          {v.toLocaleString("en-US")}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}

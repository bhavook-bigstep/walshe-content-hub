// Registry-driven engagement helpers. The metric labels/order mirror the API's platform registry
// (app/social/metrics.py); the dashboard renders whatever metric keys a row carries, so adding a
// platform later needs no change here. Pure (no DOM/React) so it's unit-testable.

export interface EngagementRow {
  post_id: number;
  platform: string;
  metrics: Record<string, number>;
  fetched_at: string; // ISO timestamp
}

/** Instagram metric keys + display labels, in order. (Other platforms would add their own list.) */
export const PLATFORM_METRICS: Record<string, { key: string; label: string }[]> = {
  instagram: [
    { key: "reach", label: "Reach" },
    { key: "views", label: "Views" },
    { key: "likes", label: "Likes" },
    { key: "comments", label: "Comments" },
    { key: "saved", label: "Saved" },
    { key: "shares", label: "Shares" },
    { key: "total_interactions", label: "Interactions" },
  ],
};

export function metricsFor(platform: string): { key: string; label: string }[] {
  return PLATFORM_METRICS[platform] ?? [];
}

/** The newest snapshot per post (cumulative metrics → latest is the current total). */
export function latestByPost(rows: EngagementRow[]): EngagementRow[] {
  const byPost = new Map<number, EngagementRow>();
  for (const r of rows) {
    const cur = byPost.get(r.post_id);
    if (!cur || r.fetched_at > cur.fetched_at) byPost.set(r.post_id, r);
  }
  return [...byPost.values()].sort((a, b) => a.post_id - b.post_id);
}

export function metricValue(row: EngagementRow, key: string): number {
  // Defensive: a legacy/stale row (or one from a pre-reshape DB) may lack `metrics` entirely —
  // never crash the dashboard over it.
  return row?.metrics?.[key] ?? 0;
}

/** Sum a metric across the latest snapshot of each post. */
export function sumMetric(rows: EngagementRow[], key: string): number {
  return latestByPost(rows).reduce((t, r) => t + metricValue(r, key), 0);
}

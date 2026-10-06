// Pure calendar helpers (no DOM). Dates render in the viewer's local timezone (design §4.1);
// there is no date library in this app, so we build the grid from native Date.

export function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  return cells;
}

export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function bucketByLocalDay<T extends { scheduled_at: string | null }>(
  posts: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const p of posts) {
    if (!p.scheduled_at) continue;
    const key = localDateKey(p.scheduled_at);
    const list = m.get(key) ?? [];
    list.push(p);
    m.set(key, list);
  }
  return m;
}

export const STATUS_CHIP: Record<string, string> = {
  draft: "chip-draft",
  pending_approval: "chip-draft",
  approved: "chip-verified",
  publishing: "chip-draft",
  published: "chip-verified",
  rejected: "chip-draft",
  failed: "chip-draft",
  cancelled: "chip-draft",
};

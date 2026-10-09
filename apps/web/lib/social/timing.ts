// Plain-word relative time for post status ("Posts in 2 days", "Posted 3 hours ago"). Pure + takes
// `now` so it's deterministic and unit-testable.

export function relativeTime(targetIso: string, now: Date = new Date()): string {
  const diffMs = new Date(targetIso).getTime() - now.getTime();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  let unit: string;
  if (abs < 60_000) return past ? "just now" : "any moment";
  else if (mins < 60) unit = `${mins} minute${mins === 1 ? "" : "s"}`;
  else if (hours < 24) unit = `${hours} hour${hours === 1 ? "" : "s"}`;
  else unit = `${days} day${days === 1 ? "" : "s"}`;

  return past ? `${unit} ago` : `in ${unit}`;
}

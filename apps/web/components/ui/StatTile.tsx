import type { ReactNode } from "react";

// One KPI per tile (brief §4/§5). Optional delta chip; delta direction encoded by label + icon,
// never colour alone (accessibility). Values are sample/seed data in this PoC.
export default function StatTile({
  label,
  value,
  caption,
  delta,
  icon,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  icon?: ReactNode;
}) {
  return (
    <div className="card card-hover flex flex-col gap-2 p-5" data-testid="stat-tile">
      <div className="flex items-center justify-between">
        <span className="text-small font-medium text-walshe-grey">{label}</span>
        {icon && <span className="text-walshe-teal" aria-hidden>{icon}</span>}
      </div>
      <span className="text-[34px] font-extrabold leading-none tracking-[-0.03em] text-walshe-ink tabular-nums">{value}</span>
      <div className="flex items-center gap-2">
        {delta && (
          <span
            className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-medium ${
              delta.direction === "up"
                ? "bg-walshe-mint text-walshe-teal"
                : delta.direction === "down"
                  ? "bg-walshe-stone text-walshe-warn"
                  : "bg-walshe-stone text-walshe-grey"
            }`}
          >
            <span aria-hidden>
              {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "■"}
            </span>
            {delta.value}
          </span>
        )}
        {caption && <span className="text-small text-walshe-grey">{caption}</span>}
      </div>
    </div>
  );
}

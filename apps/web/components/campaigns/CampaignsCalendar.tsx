"use client";

import Link from "next/link";
import { useState } from "react";
import type { Campaign } from "../../lib/api";
import { addMonths, coversDay, monthCells } from "../../lib/campaigns/calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A month overview of the agent's campaigns — each campaign appears on every day of its
 *  [starts_on, ends_on] range; clicking a chip opens that campaign. */
export default function CampaignsCalendar({ campaigns }: { campaigns: Campaign[] }) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = monthCells(year, month);
  const label = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayStr = new Date().toDateString();

  return (
    <section className="card mb-8 p-5" data-testid="campaigns-calendar" aria-label="Campaigns calendar">
      <div className="mb-4 flex items-center gap-2">
        <button type="button" className="btn-ghost h-9 px-4" onClick={() => setCursor(new Date())}>
          Today
        </button>
        <button type="button" className="btn-ghost h-9 px-3" aria-label="Previous month"
                onClick={() => setCursor(addMonths(cursor, -1))}>‹</button>
        <button type="button" className="btn-ghost h-9 px-3" aria-label="Next month"
                onClick={() => setCursor(addMonths(cursor, 1))}>›</button>
        <h2 className="ml-2 text-h3 font-bold text-walshe-ink">{label}</h2>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-2 text-small font-medium text-walshe-grey">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`pad-${i}`} className="min-h-24 rounded-sm bg-walshe-stone/30" aria-hidden />;
          }
          const isToday = cell.toDateString() === todayStr;
          const active = campaigns.filter((c) => coversDay(c, cell));
          return (
            <div key={cell.toISOString()} className="min-h-24 rounded-sm border border-walshe-line p-1.5">
              <div className={
                isToday
                  ? "grid h-6 w-6 place-items-center rounded-full bg-walshe-teal text-[11px] font-bold text-white"
                  : "text-[11px] text-walshe-grey"
              }>
                {cell.getDate()}
              </div>
              <div className="mt-1 space-y-1">
                {active.map((c) => (
                  <Link
                    key={c.id}
                    href={`/agent/campaigns/${c.id}`}
                    title={c.name}
                    className="block truncate rounded px-1 py-0.5 text-[11px] chip-verified"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

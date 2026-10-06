"use client";

import Link from "next/link";
import { useState } from "react";
import type { Campaign } from "../../lib/api";
import { addMonths, layoutWeekBars, monthCells } from "../../lib/campaigns/calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Layout constants for the spanning-bar overlay (px). HEADER is the day-number strip at the top of
// each week row; LANE is one stacked bar's height incl. its gap; FLOOR keeps empty weeks a
// comfortable height that matches the detail calendar's cells (min-h-24 ≈ 96px).
const HEADER = 30;
const LANE = 22;
const FLOOR = 96;

/** A month overview of the agent's campaigns, styled like the campaign-detail calendar. Each
 *  campaign is drawn as ONE continuous bar spanning its date range within a week (not a chip
 *  repeated per day); clicking a bar opens that campaign. */
export default function CampaignsCalendar({ campaigns }: { campaigns: Campaign[] }) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = monthCells(year, month);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const label = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayStr = new Date().toDateString();

  return (
    <section className="card p-0" data-testid="campaigns-calendar" aria-label="Campaigns calendar">
      {/* Toolbar — mirrors the campaign-detail calendar (month-only; campaigns are date ranges). */}
      <div className="flex flex-wrap items-center gap-4 border-b border-walshe-line px-4 py-3">
        <button type="button" className="btn-secondary h-10 px-4" onClick={() => setCursor(new Date())}>
          Today
        </button>
        <div className="flex items-center">
          <button type="button" aria-label="Previous month" className="btn-ghost h-10 w-10 px-0 text-h3"
                  onClick={() => setCursor(addMonths(cursor, -1))}>‹</button>
          <button type="button" aria-label="Next month" className="btn-ghost h-10 w-10 px-0 text-h3"
                  onClick={() => setCursor(addMonths(cursor, 1))}>›</button>
        </div>
        <h2 className="ml-1 text-h3 font-semibold text-walshe-ink">{label}</h2>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 border-b border-walshe-line pb-2 text-eyebrow text-walshe-grey">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 text-center">{d}</div>
          ))}
        </div>

        {weeks.map((week, wi) => {
          const { bars, laneCount } = layoutWeekBars(week, campaigns);
          const minHeight = Math.max(FLOOR, HEADER + laneCount * LANE + 8);
          return (
            <div key={wi} className="relative" style={{ minHeight }}>
              {/* Background day cells — borders + day number, identical to the detail calendar. */}
              <div className="grid h-full grid-cols-7">
                {week.map((cell, i) => (
                  <div
                    key={i}
                    className={`h-full border-b border-r border-walshe-line p-1.5 ${
                      i === 0 ? "border-l" : ""
                    } ${cell ? "" : "bg-walshe-stone/20"}`}
                    aria-hidden={cell ? undefined : true}
                  >
                    {cell && (
                      <div className="flex justify-end">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-pill text-[12px] font-semibold ${
                            cell.toDateString() === todayStr
                              ? "bg-walshe-teal text-white"
                              : "text-walshe-grey"
                          }`}
                        >
                          {cell.getDate()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Spanning campaign bars, laid over the cells and packed into lanes. */}
              <div
                className="pointer-events-none absolute inset-x-0 grid grid-cols-7 gap-x-1 gap-y-0.5 px-1"
                style={{ top: HEADER, gridAutoRows: `${LANE - 2}px` }}
              >
                {bars.map((b) => (
                  <Link
                    key={b.id}
                    href={`/agent/campaigns/${b.id}`}
                    title={b.name}
                    className="pointer-events-auto truncate rounded-sm bg-walshe-teal/15 px-2 text-[11px] font-medium leading-[20px] text-walshe-teal transition-colors hover:bg-walshe-teal/25"
                    style={{ gridColumn: `${b.startCol + 1} / span ${b.span}`, gridRowStart: b.lane + 1 }}
                  >
                    {b.name}
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  bucketByLocalDay,
  dayKey,
  HOURS,
  minutesSinceMidnight,
  monthCells,
  sameLocalDay,
  STATUS_CHIP,
  weekDays,
} from "../../lib/campaigns/calendar";

// A Google-Calendar-style campaign calendar: Month / Week / Day views with Prev · Today · Next
// navigation, hand-rolled from native Date + Tailwind (no date library — explicit decision).
// All times render in the viewer's LOCAL timezone via new Date(iso).

export interface CalendarPost {
  id: number;
  caption: string;
  status: string;
  scheduled_at: string | null;
}

type View = "month" | "week" | "day";

// One hour = 48px of grid height (matches the h-12 hour rows), so a post's vertical offset is
// minutesSinceMidnight / 60 * HOUR_PX. Shared by the week and day time grids.
const HOUR_PX = 48;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const isToday = (d: Date) => {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

export default function CampaignCalendar({
  posts,
  onSelectPost,
  initialDate,
}: {
  posts: CalendarPost[];
  onSelectPost?: (postId: number) => void;
  initialDate?: Date;
}) {
  const [view, setView] = useState<View>("month");
  // The anchor date the current period is derived from. Set once on mount; navigation moves it.
  const [cursor, setCursor] = useState<Date>(() => initialDate ?? new Date());

  const byDay = useMemo(() => bucketByLocalDay(posts), [posts]);
  const unscheduled = useMemo(() => posts.filter((p) => p.scheduled_at === null), [posts]);

  // Prev (-1) / Today (0) / Next (+1), stepping by the unit the current view shows.
  const navigate = (dir: -1 | 0 | 1) => {
    if (dir === 0) {
      setCursor(new Date());
      return;
    }
    setCursor((c) =>
      view === "month" ? addMonths(c, dir) : view === "week" ? addDays(c, dir * 7) : addDays(c, dir),
    );
  };

  const label = useMemo(() => periodLabel(view, cursor), [view, cursor]);

  return (
    <section className="card p-0" aria-label="Campaign calendar" data-testid="campaign-calendar">
      {/* Toolbar: Today · Prev · Next · period label | view switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-walshe-line px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary h-10 px-4" onClick={() => navigate(0)}>
            Today
          </button>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Previous period"
              className="btn-ghost h-10 w-10 px-0 text-h3"
              onClick={() => navigate(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next period"
              className="btn-ghost h-10 w-10 px-0 text-h3"
              onClick={() => navigate(1)}
            >
              ›
            </button>
          </div>
          <h2 className="ml-1 text-h3 font-semibold text-walshe-ink">{label}</h2>
        </div>

        <div className="inline-flex rounded-pill border border-walshe-line p-0.5" role="group" aria-label="Calendar view">
          {(["month", "week", "day"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-pill px-4 py-1.5 text-small font-semibold capitalize transition-colors ${
                view === v
                  ? "bg-walshe-teal text-white"
                  : "text-walshe-grey hover:text-walshe-ink"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "month" && (
        <MonthView cursor={cursor} byDay={byDay} onSelectPost={onSelectPost} />
      )}
      {view === "week" && (
        <TimeGridView
          days={weekDays(cursor)}
          byDay={byDay}
          unscheduled={unscheduled}
          onSelectPost={onSelectPost}
        />
      )}
      {view === "day" && (
        <TimeGridView
          days={[cursor]}
          byDay={byDay}
          unscheduled={unscheduled}
          onSelectPost={onSelectPost}
        />
      )}
    </section>
  );
}

function periodLabel(view: View, cursor: Date): string {
  if (view === "month") {
    return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  if (view === "day") {
    return cursor.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  const days = weekDays(cursor);
  const start = days[0];
  const end = days[6];
  const startFmt = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endFmt = end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startFmt} – ${endFmt}`;
}

// ── Month view ──────────────────────────────────────────────────────────────────────────────────

function MonthView({
  cursor,
  byDay,
  onSelectPost,
}: {
  cursor: Date;
  byDay: Map<string, CalendarPost[]>;
  onSelectPost?: (id: number) => void;
}) {
  const cells = monthCells(cursor.getFullYear(), cursor.getMonth());
  return (
    <div className="p-4">
      <div className="grid grid-cols-7 border-b border-walshe-line pb-2 text-eyebrow text-walshe-grey">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          if (!cell) {
            return (
              <div
                key={`pad-${i}`}
                className="min-h-24 border-b border-r border-walshe-line bg-walshe-stone/20 first:border-l"
                aria-hidden
              />
            );
          }
          const posts = byDay.get(dayKey(cell)) ?? [];
          const today = isToday(cell);
          return (
            <div
              key={dayKey(cell)}
              className="min-h-24 border-b border-r border-walshe-line p-1.5 [&:nth-child(7n+1)]:border-l"
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-pill text-[12px] font-semibold ${
                    today ? "bg-walshe-teal text-white" : "text-walshe-grey"
                  }`}
                >
                  {cell.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {posts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPost?.(p.id)}
                    title={p.caption || `Post #${p.id}`}
                    className={`block w-full truncate rounded-sm px-1.5 py-0.5 text-left text-[11px] leading-tight ${
                      STATUS_CHIP[p.status] ?? ""
                    }`}
                  >
                    {p.scheduled_at && (
                      <span className="font-semibold tabular-nums">{fmtTime(p.scheduled_at)} </span>
                    )}
                    {p.caption || `Post #${p.id}`}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week / Day time grid ────────────────────────────────────────────────────────────────────────

function TimeGridView({
  days,
  byDay,
  unscheduled,
  onSelectPost,
}: {
  days: Date[];
  byDay: Map<string, CalendarPost[]>;
  unscheduled: CalendarPost[];
  onSelectPost?: (id: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Open the grid near the working day (07:00) rather than at midnight.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX;
  }, [days.length]);

  const now = new Date();
  const nowOffset = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_PX;

  return (
    <div>
      {unscheduled.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-walshe-line px-4 py-2">
          <span className="text-eyebrow text-walshe-grey">Unscheduled</span>
          {unscheduled.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPost?.(p.id)}
              title={p.caption || `Post #${p.id}`}
              className={`max-w-[12rem] truncate rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
                STATUS_CHIP[p.status] ?? ""
              }`}
            >
              {p.caption || `Post #${p.id}`}
            </button>
          ))}
        </div>
      )}

      {/* Day headers, aligned to the hour-gutter width below. */}
      <div className="flex border-b border-walshe-line">
        <div className="w-14 shrink-0" aria-hidden />
        {days.map((d) => {
          const today = isToday(d);
          return (
            <div key={dayKey(d)} className="flex-1 border-l border-walshe-line py-2 text-center">
              <div className="text-eyebrow text-walshe-grey">
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="mt-0.5 flex justify-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-pill text-small font-semibold ${
                    today ? "bg-walshe-teal text-white" : "text-walshe-ink"
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable hour grid. */}
      <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
        <div className="flex">
          {/* Hour gutter */}
          <div className="w-14 shrink-0">
            {HOURS.map((h) => (
              <div key={h} className="relative h-12">
                <span className="absolute -top-2 right-2 text-[10px] text-walshe-grey">
                  {h === 0 ? "" : formatHour(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const dayPosts = (byDay.get(dayKey(d)) ?? []).filter(
              (p): p is CalendarPost & { scheduled_at: string } =>
                p.scheduled_at !== null && sameLocalDay(p.scheduled_at, d),
            );
            return (
              <div key={dayKey(d)} className="relative flex-1 border-l border-walshe-line">
                {HOURS.map((h) => (
                  <div key={h} className="h-12 border-t border-walshe-line/50" />
                ))}

                {/* Now indicator (only on today's column). */}
                {isToday(d) && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                    style={{ top: nowOffset }}
                    aria-hidden
                  >
                    <span className="-ml-1 h-2 w-2 rounded-pill bg-walshe-gold" />
                    <span className="h-px flex-1 bg-walshe-gold" />
                  </div>
                )}

                {/* Timed posts */}
                <div className="absolute inset-0">
                  {dayPosts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectPost?.(p.id)}
                      title={p.caption || `Post #${p.id}`}
                      style={{ top: (minutesSinceMidnight(p.scheduled_at) / 60) * HOUR_PX }}
                      className={`absolute left-0.5 right-0.5 min-h-[20px] overflow-hidden rounded-sm px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-card ${
                        STATUS_CHIP[p.status] ?? ""
                      }`}
                    >
                      <span className="block font-semibold tabular-nums">
                        {fmtTime(p.scheduled_at)}
                      </span>
                      <span className="block truncate">{p.caption || `Post #${p.id}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 13 -> "1 PM", 0 handled by caller (label omitted at midnight).
function formatHour(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${period}`;
}

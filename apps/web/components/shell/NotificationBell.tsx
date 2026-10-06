"use client";

// AC74 — navbar notification bell for the provider. Polls GET /me/jobs, shows a badge for
// in-progress / just-completed Auto-Catalog import jobs (AC71), and opens a list of recent jobs with
// status + a link to the drafts a finished job created. Loading / empty / error states handled.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { listJobs, type Job } from "../../lib/api";
import {
  JOB_POLL_MS,
  JOBS_CHANGED_EVENT,
  highestJobId,
  statusLabel,
  summarizeJobs,
} from "../../lib/jobs";

const SEEN_KEY = "walsh-jobs-last-seen";

function readLastSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastSeen(id: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    /* storage blocked — the badge simply won't persist the acknowledgement */
  }
}

export default function NotificationBell() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  // Load the acknowledged watermark once on mount (localStorage is not read during SSR).
  useEffect(() => {
    setLastSeen(readLastSeen());
  }, []);

  // Poll the jobs list on mount and every JOB_POLL_MS. A failed poll flips to the error state but
  // never throws, and the next tick can recover.
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const next = await listJobs();
        if (!alive) return;
        setJobs(next);
        setError(false);
      } catch {
        if (alive) setError(true);
      }
    }
    void tick();
    const timer = window.setInterval(tick, JOB_POLL_MS);
    // Refetch immediately when an import is enqueued, so the new job appears the moment Import is
    // clicked instead of after the next poll (AC74 — see JOBS_CHANGED_EVENT).
    const onChanged = () => void tick();
    window.addEventListener(JOBS_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(JOBS_CHANGED_EVENT, onChanged);
    };
  }, []);

  // Close the menu on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const list = jobs ?? [];
  const { badge } = summarizeJobs(list, lastSeen);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      // Opening the menu acknowledges every job currently shown (clears the "unseen" part of the badge).
      if (next && list.length > 0) {
        const top = highestJobId(list);
        writeLastSeen(top);
        setLastSeen(top);
      }
      return next;
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={badge > 0 ? `Notifications (${badge})` : "Notifications"}
        className="relative grid h-9 w-9 place-items-center rounded-md text-chrome-fg/70 transition-colors hover:bg-chrome-fg/10 hover:text-chrome-fg"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badge > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-walshe-gold px-1 text-[10px] font-bold text-walshe-ink"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-md border border-chrome-fg/10 bg-chrome-bg shadow-lg"
        >
          <div className="border-b border-chrome-fg/10 px-4 py-2.5 text-small font-semibold text-chrome-fg">
            Import jobs
          </div>
          <div className="max-h-80 overflow-y-auto">
            {jobs === null && !error ? (
              <p className="px-4 py-6 text-small text-chrome-fg/60">Loading…</p>
            ) : error ? (
              <p className="px-4 py-6 text-small text-chrome-fg/60">Couldn’t load jobs. Retrying…</p>
            ) : list.length === 0 ? (
              <p className="px-4 py-6 text-small text-chrome-fg/60">
                No imports yet. Use “Import from document” in your catalog to start one.
              </p>
            ) : (
              <ul>
                {list.map((job) => (
                  <li key={job.id} className="border-b border-chrome-fg/5 last:border-0">
                    <JobRow job={job} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function JobRow({ job, onNavigate }: { job: Job; onNavigate: () => void }) {
  const ready = job.status === "done" && job.drafts_created > 0;
  const summary =
    job.status === "done"
      ? `${job.drafts_created} draft${job.drafts_created === 1 ? "" : "s"} created`
      : job.status === "failed"
        ? "Import failed"
        : "Working on it";
  const body = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        aria-hidden
        className={`mt-1.5 h-2 w-2 flex-none rounded-full ${
          job.status === "done"
            ? "bg-walshe-teal"
            : job.status === "failed"
              ? "bg-walshe-danger"
              : "bg-walshe-gold"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-medium text-chrome-fg">
          {job.filename || "Document import"}
        </span>
        <span className="block text-[12px] text-chrome-fg/55">
          {statusLabel(job.status)} · {summary}
        </span>
      </span>
    </div>
  );
  // A finished job links to the catalog, pre-filtered to the AI-created drafts it produced.
  return ready ? (
    <Link
      href="/provider/catalog?ai_created=true"
      role="menuitem"
      onClick={onNavigate}
      className="block transition-colors hover:bg-chrome-fg/5"
    >
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

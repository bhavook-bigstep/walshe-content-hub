// Notification-bell state derivation (AC74) — pure, so it is unit-tested without a DOM.
// The bell polls GET /me/jobs (see lib/api `listJobs`) and renders from these helpers.
import type { Job } from "./api";

// How often the bell re-polls the jobs list. Polling (no push transport) is the PoC choice.
export const JOB_POLL_MS = 10_000;

export type JobStatus = "queued" | "running" | "done" | "failed";

export function isTerminal(job: Pick<Job, "status">): boolean {
  return job.status === "done" || job.status === "failed";
}

export function isInProgress(job: Pick<Job, "status">): boolean {
  return job.status === "queued" || job.status === "running";
}

export interface JobSummary {
  /** Jobs still queued or running. */
  inProgress: number;
  /** Jobs that finished successfully. */
  done: number;
  /** Jobs that failed. */
  failed: number;
  /** Terminal jobs the viewer has not acknowledged yet (id greater than lastSeenId). */
  unseen: number;
  /** The badge number to show (in-progress + unseen); 0 means no badge. */
  badge: number;
}

/**
 * Summarise the provider's jobs for the bell badge. ``lastSeenId`` is the highest job id the viewer
 * has already acknowledged (by opening the menu); terminal jobs newer than it count as "unseen" so a
 * freshly-finished import is announced even after it stops being in-progress.
 */
export function summarizeJobs(jobs: readonly Job[], lastSeenId = 0): JobSummary {
  let inProgress = 0;
  let done = 0;
  let failed = 0;
  let unseen = 0;
  for (const job of jobs) {
    if (isInProgress(job)) inProgress++;
    if (job.status === "done") done++;
    if (job.status === "failed") failed++;
    if (isTerminal(job) && job.id > lastSeenId) unseen++;
  }
  return { inProgress, done, failed, unseen, badge: inProgress + unseen };
}

/** The highest job id in the list (0 for an empty list) — what the menu stores as "seen" on open. */
export function highestJobId(jobs: readonly Job[]): number {
  return jobs.reduce((max, job) => (job.id > max ? job.id : max), 0);
}

/** A short, human label for a job's current status (used in the bell menu). */
export function statusLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Processing…";
    case "done":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

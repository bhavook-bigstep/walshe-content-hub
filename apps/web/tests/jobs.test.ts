import { describe, expect, it } from "vitest";
import type { Job } from "../lib/api";
import { highestJobId, isInProgress, isTerminal, statusLabel, summarizeJobs } from "../lib/jobs";

// A synthetic job — only the fields the bell reads; the rest are filled with harmless defaults.
function job(id: number, status: Job["status"], drafts = 0): Job {
  return {
    id,
    kind: "auto_catalog_import",
    filename: `doc-${id}.pdf`,
    status,
    drafts_created: drafts,
    entry_ids: [],
    error: "",
    created_at: "2026-10-06T00:00:00Z",
    updated_at: "2026-10-06T00:00:00Z",
  } as Job;
}

describe("job status predicates", () => {
  it("classifies in-progress vs terminal", () => {
    expect(isInProgress(job(1, "queued"))).toBe(true);
    expect(isInProgress(job(1, "running"))).toBe(true);
    expect(isInProgress(job(1, "done"))).toBe(false);
    expect(isTerminal(job(1, "done"))).toBe(true);
    expect(isTerminal(job(1, "failed"))).toBe(true);
    expect(isTerminal(job(1, "running"))).toBe(false);
  });
});

describe("summarizeJobs (bell badge)", () => {
  it("counts in-progress jobs and unseen terminal jobs", () => {
    const jobs = [job(3, "running"), job(2, "done", 2), job(1, "failed")];
    // Nothing acknowledged yet: 1 in-progress + 2 unseen terminal = badge 3.
    const fresh = summarizeJobs(jobs, 0);
    expect(fresh.inProgress).toBe(1);
    expect(fresh.done).toBe(1);
    expect(fresh.failed).toBe(1);
    expect(fresh.unseen).toBe(2);
    expect(fresh.badge).toBe(3);
  });

  it("drops the unseen part once the viewer has acknowledged up to the latest id", () => {
    const jobs = [job(3, "running"), job(2, "done", 2), job(1, "failed")];
    // Acknowledged through id 3: terminal jobs (1,2) are no longer unseen; only the running one badges.
    const seen = summarizeJobs(jobs, 3);
    expect(seen.unseen).toBe(0);
    expect(seen.badge).toBe(1); // the still-running job keeps a badge
  });

  it("is 0 for an empty list and when everything is seen + terminal", () => {
    expect(summarizeJobs([], 0).badge).toBe(0);
    const done = [job(2, "done", 1), job(1, "done", 3)];
    expect(summarizeJobs(done, 2).badge).toBe(0);
  });
});

describe("highestJobId + statusLabel", () => {
  it("finds the max id (0 when empty)", () => {
    expect(highestJobId([])).toBe(0);
    expect(highestJobId([job(5, "done"), job(9, "queued"), job(2, "failed")])).toBe(9);
  });
  it("maps statuses to human labels", () => {
    expect(statusLabel("queued")).toBe("Queued");
    expect(statusLabel("running")).toBe("Processing…");
    expect(statusLabel("done")).toBe("Ready");
    expect(statusLabel("failed")).toBe("Failed");
    expect(statusLabel("weird")).toBe("weird");
  });
});

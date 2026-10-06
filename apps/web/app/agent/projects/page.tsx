"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "../../../components/ui/PageHeader";
import { listProjects, deleteProject, type Project } from "../../../lib/api";

// Saved Design Studio compositions (AC28) as a paginated list/table. Agent-only; the API re-checks.
const PAGE_SIZE = 20;

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProjects(await listProjects());
    } catch (e) {
      setProjects([]);
      setError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: number) {
    setPendingId(id);
    setError(null);
    try {
      await deleteProject(id);
      setProjects((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPendingId(null);
    }
  }

  const loading = projects === null;
  const total = projects?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const shown = useMemo(
    () => (projects ?? []).slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [projects, current],
  );

  const iconBtn =
    "grid h-9 w-9 place-items-center rounded-md border border-walshe-line text-walshe-ink transition-colors hover:bg-walshe-ink/10 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div>
      <PageHeader title="Projects" />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      {loading && !error ? (
        <div className="card overflow-hidden p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse border-b border-walshe-line/60 bg-walshe-stone/40" aria-hidden />
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-small">
              <thead>
                <tr className="border-b border-walshe-line text-[12px] uppercase tracking-wide text-walshe-grey">
                  <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Format</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Items</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-b border-walshe-line/60 last:border-0 hover:bg-walshe-ink/[0.03]">
                    <td className="px-4 py-3 font-medium text-walshe-ink">{p.name}</td>
                    <td className="px-4 py-3 capitalize text-walshe-grey">{p.format}</td>
                    <td className="px-4 py-3 text-walshe-grey">{p.item_ids.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          aria-label={`Open ${p.name} in the Design Studio`}
                          title="Open in studio"
                          onClick={() => router.push(`/agent/studio?project=${p.id}`)}
                          className={iconBtn}
                        >
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${p.name}`}
                          title="Delete"
                          disabled={pendingId === p.id}
                          onClick={() => void remove(p.id)}
                          className={`${iconBtn} text-walshe-danger hover:bg-walshe-danger/10`}
                        >
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between text-small text-walshe-grey">
              <span>
                {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={current <= 1}
                  onClick={() => setPage((n) => Math.max(1, n - 1))}
                >
                  Previous
                </button>
                <span className="tabular-nums">
                  Page {current} of {pageCount}
                </span>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={current >= pageCount}
                  onClick={() => setPage((n) => Math.min(pageCount, n + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        !error && (
          <div className="card p-8 text-center text-walshe-grey">
            No saved projects yet — build one in the Design Studio.
          </div>
        )
      )}
    </div>
  );
}

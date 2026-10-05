"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "../../../components/ui/PageHeader";
import { listProjects, deleteProject, type Project } from "../../../lib/api";

// Saved Design Studio compositions (AC28). Agent-only; the API re-checks the role.
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

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

  return (
    <div>
      <PageHeader title="Projects" description="Your saved Design Studio compositions." />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      {loading && !error ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-36 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="card p-5">
              <p className="font-medium text-walshe-ink">{p.name}</p>
              <p className="mt-1 text-small text-walshe-grey">
                {p.format} · {p.item_ids.length} items
              </p>
              <div className="mt-4 flex items-center justify-between">
                <Link href={`/agent/studio?project=${p.id}`} className="btn-ghost">
                  Open in studio
                </Link>
                <button
                  type="button"
                  disabled={pendingId === p.id}
                  onClick={() => void remove(p.id)}
                  className="btn-ghost text-walshe-danger"
                >
                  {pendingId === p.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
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

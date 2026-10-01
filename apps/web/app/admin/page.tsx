"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/ui/PageHeader";
import StatTile from "../../components/ui/StatTile";
import { approveProvider, listUsers, type User } from "../../lib/api";

// Super-admin screen (AC2). Route is guarded by middleware; the API re-checks the role on every call.
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  content_provider: "Content provider",
  tourism_agent: "Tourism agent",
};

export default function AdminPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (e) {
      setUsers([]);
      setError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: number) {
    setPendingId(id);
    setError(null);
    try {
      const updated = await approveProvider(id);
      setUsers((prev) => (prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPendingId(null);
    }
  }

  const loading = users === null;
  const total = users?.length ?? 0;
  const providers = users?.filter((u) => u.role === "content_provider").length ?? 0;
  const agents = users?.filter((u) => u.role === "tourism_agent").length ?? 0;
  const queue = users?.filter((u) => u.role === "content_provider" && !u.approved) ?? [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/admin" }, { label: "Users" }]}
        title="Users"
        description="Govern tenants, users and provider verification across the hub."
      />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      <section aria-label="Key figures" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !error ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))
        ) : (
          <>
            <StatTile label="Total users" value={total} />
            <StatTile label="Content providers" value={providers} />
            <StatTile label="Tourism agents" value={agents} />
            <StatTile label="Pending verification" value={queue.length} caption="Providers awaiting approval" />
          </>
        )}
      </section>

      {/* Verification queue */}
      {!loading && queue.length > 0 && (
        <section aria-labelledby="queue-title" className="mb-8">
          <h2 id="queue-title" className="mb-4 text-h3 font-bold text-walshe-ink">
            Verification queue
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {queue.map((u) => (
              <li key={u.id} className="card card-hover flex flex-col gap-3 p-5">
                <div>
                  <p className="font-medium text-walshe-ink">{u.email}</p>
                  <p className="text-small text-walshe-grey">Content provider · pending</p>
                </div>
                <button
                  type="button"
                  disabled={pendingId === u.id}
                  onClick={() => void approve(u.id)}
                  className="btn-primary self-start"
                >
                  {pendingId === u.id ? "Approving…" : "Approve provider"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Full directory */}
      <section aria-labelledby="directory-title">
        <h2 id="directory-title" className="mb-4 text-h3 font-bold text-walshe-ink">
          All users
        </h2>
        {loading && !error ? (
          <div className="card h-48 animate-pulse bg-walshe-stone/60" aria-hidden />
        ) : total === 0 && !error ? (
          <div className="card p-8 text-center text-body text-walshe-grey">No users yet.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-small">
              <thead>
                <tr className="border-b border-walshe-stone text-walshe-grey">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users!.map((u, i) => (
                  <tr key={u.id} className={i % 2 === 1 ? "bg-walshe-stone/40" : undefined}>
                    <td className="px-4 py-3 text-walshe-ink">{u.email}</td>
                    <td className="px-4 py-3 text-walshe-grey">{ROLE_LABEL[u.role] ?? u.role}</td>
                    <td className="px-4 py-3">
                      <span className={u.approved ? "chip-verified" : "chip-draft"}>
                        {u.approved ? "Approved" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role === "content_provider" && !u.approved && (
                        <button
                          type="button"
                          disabled={pendingId === u.id}
                          onClick={() => void approve(u.id)}
                          className="btn-ghost"
                        >
                          {pendingId === u.id ? "Approving…" : "Approve provider"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

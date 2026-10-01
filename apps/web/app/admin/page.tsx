"use client";

import { useCallback, useEffect, useState } from "react";
import { approveProvider, listUsers, type User } from "../../lib/api";

// Super-admin screen (AC2). Route is guarded by middleware; the API re-checks the role on every call.
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

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

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Users</h1>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {users === null && (
        <p role="status" className="text-sm text-slate-600">
          Loading users...
        </p>
      )}
      {users && users.length === 0 && !error && <p className="text-sm text-slate-600">No users yet.</p>}
      {users && users.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2">Email</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.email}</td>
                <td>{u.role}</td>
                <td>{u.approved ? "Approved" : "Pending"}</td>
                <td className="text-right">
                  {u.role === "content_provider" && !u.approved && (
                    <button
                      type="button"
                      disabled={pendingId === u.id}
                      onClick={() => void approve(u.id)}
                      className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50"
                    >
                      {pendingId === u.id ? "Approving..." : "Approve provider"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

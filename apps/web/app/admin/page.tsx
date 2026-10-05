"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../components/ui/PageHeader";
import StatTile from "../../components/ui/StatTile";
import { approveProvider, createUser, listUsers, type User } from "../../lib/api";

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

  // Provision-a-user form (AC24b).
  const [cuEmail, setCuEmail] = useState("");
  const [cuPassword, setCuPassword] = useState("");
  const [cuRole, setCuRole] = useState<"content_provider" | "tourism_agent">("content_provider");
  const [cuOrg, setCuOrg] = useState("");
  const [cuBusy, setCuBusy] = useState(false);
  const [cuError, setCuError] = useState<string | null>(null);
  const [cuDone, setCuDone] = useState<string | null>(null);

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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCuError(null);
    setCuDone(null);
    if (cuPassword.length < 8) {
      setCuError("Password must be at least 8 characters.");
      return;
    }
    setCuBusy(true);
    try {
      const created = await createUser({
        email: cuEmail,
        password: cuPassword,
        role: cuRole,
        organization: cuRole === "content_provider" ? cuOrg : null,
      });
      setUsers((prev) => (prev ? [...prev, created] : [created]));
      setCuDone(
        `${ROLE_LABEL[created.role]} ${created.email} created${
          created.role === "content_provider" ? " — pending verification." : "."
        }`,
      );
      setCuEmail("");
      setCuPassword("");
      setCuOrg("");
    } catch (err) {
      setCuError(messageOf(err));
    } finally {
      setCuBusy(false);
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

      {/* Provision a user (AC24b) */}
      <section aria-labelledby="provision-title" className="mb-10">
        <div className="mb-4">
          <p className="eyebrow">Add to the hub</p>
          <h2 id="provision-title" className="mt-2 text-h3 text-walshe-ink">
            Provision a user
          </h2>
          <p className="mt-1 text-small text-walshe-grey">
            Create a Content Provider (tied to an organization, pending verification) or a Tourism Agent.
          </p>
        </div>
        <form onSubmit={onCreate} className="card grid gap-5 p-6 sm:grid-cols-2" aria-busy={cuBusy}>
          <label className="block">
            <span className="label">Role</span>
            <select
              value={cuRole}
              onChange={(e) => setCuRole(e.target.value as "content_provider" | "tourism_agent")}
              className="field"
            >
              <option value="content_provider">Content provider</option>
              <option value="tourism_agent">Tourism agent</option>
            </select>
          </label>
          <label className="block">
            <span className="label">{cuRole === "content_provider" ? "Organization" : "Organization (n/a)"}</span>
            <input
              type="text"
              value={cuOrg}
              onChange={(e) => setCuOrg(e.target.value)}
              disabled={cuRole !== "content_provider"}
              required={cuRole === "content_provider"}
              placeholder="e.g. Tourism Ireland"
              className="field disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input
              type="email"
              required
              autoComplete="off"
              value={cuEmail}
              onChange={(e) => setCuEmail(e.target.value)}
              className="field"
            />
          </label>
          <label className="block">
            <span className="label">Temporary password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={cuPassword}
              onChange={(e) => setCuPassword(e.target.value)}
              className="field"
            />
          </label>
          <div className="sm:col-span-2">
            {cuError && (
              <p role="alert" className="mb-3 text-small font-medium text-walshe-danger">
                {cuError}
              </p>
            )}
            {cuDone && (
              <p role="status" className="mb-3 text-small font-medium text-walshe-green">
                {cuDone}
              </p>
            )}
            <button type="submit" disabled={cuBusy} className="btn-primary">
              {cuBusy ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </section>

      {/* Verification queue */}
      {!loading && queue.length > 0 && (
        <section aria-labelledby="queue-title" className="mb-10">
          <div className="mb-4">
            <p className="eyebrow">Needs your review</p>
            <h2 id="queue-title" className="mt-2 text-h3 text-walshe-ink">
              Verification queue
            </h2>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {queue.map((u) => (
              <li key={u.id} className="card card-hover flex flex-col gap-4 p-6">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="grid h-10 w-10 flex-none place-items-center rounded-md bg-walshe-teal text-base font-bold uppercase text-white"
                  >
                    {u.email.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-walshe-ink">{u.email}</p>
                    <p className="mt-0.5 text-small text-walshe-grey">Content provider · pending</p>
                  </div>
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
        <div className="mb-4">
          <p className="eyebrow">Directory</p>
          <h2 id="directory-title" className="mt-2 text-h3 text-walshe-ink">
            All users
          </h2>
        </div>
        {loading && !error ? (
          <div className="card h-48 animate-pulse bg-walshe-stone/60" aria-hidden />
        ) : total === 0 && !error ? (
          <div className="card p-8 text-center text-body text-walshe-grey">No users yet.</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-small">
              <thead>
                <tr className="border-b border-walshe-line bg-walshe-mist/60 text-walshe-grey">
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">Email</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">Role</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">Status</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {users!.map((u) => (
                  <tr key={u.id} className="border-b border-walshe-line/70 last:border-0 transition-colors hover:bg-walshe-ink/5">
                    <td className="px-5 py-3.5 font-medium text-walshe-ink">{u.email}</td>
                    <td className="px-5 py-3.5 text-walshe-grey">{ROLE_LABEL[u.role] ?? u.role}</td>
                    <td className="px-5 py-3.5">
                      <span className={u.approved ? "chip-verified" : "chip-draft"}>
                        {u.approved ? "Approved" : "Pending"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
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

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import { listTeam, inviteMember, ApiError, type TeamMember } from "../../../lib/api";

// Provider team members (AC29): colleagues in the same organization; invite adds a pending member.
function messageOf(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return "That email already has an account.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong";
}

function initialsOf(member: TeamMember): string {
  const source = member.display_name?.trim() || member.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function ProviderTeamPage() {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTeam(await listTeam());
    } catch (e) {
      setTeam([]);
      setError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormOk(null);
    if (password.length < 8) {
      setFormError("Temporary password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const created = await inviteMember({ email, password, display_name: name || null });
      const row: TeamMember = {
        id: created.id,
        email: created.email,
        display_name: created.display_name ?? null,
        approved: created.approved,
      };
      setTeam((prev) => (prev ? [row, ...prev] : [row]));
      setFormOk(`Invite sent to ${created.email}.`);
      setEmail("");
      setName("");
      setPassword("");
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const loading = team === null;

  return (
    <div>
      <PageHeader title="Team" description="Colleagues in your organization." />

      <form onSubmit={onInvite} className="card mb-8 grid gap-5 p-6 sm:grid-cols-2" aria-busy={busy}>
        <div className="sm:col-span-2">
          <p className="eyebrow">Grow your team</p>
          <h2 className="mt-2 text-h3 text-walshe-ink">Invite a colleague</h2>
        </div>
        <label className="block">
          <span className="label">Email</span>
          <input
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </label>
        <label className="block">
          <span className="label">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </label>
        <div className="sm:col-span-2">
          {formError && (
            <p role="alert" className="mb-3 text-small font-medium text-walshe-danger">
              {formError}
            </p>
          )}
          {formOk && (
            <p role="status" className="mb-3 text-small font-medium text-walshe-green">
              {formOk}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>

      {error ? (
        <div role="alert" className="card border-walshe-danger/30 p-8 text-center text-walshe-danger">
          {error}
        </div>
      ) : loading ? (
        <div className="card h-48 animate-pulse bg-walshe-stone/60" aria-hidden />
      ) : team.length === 0 ? (
        <div className="card p-8 text-center text-walshe-grey">No team members yet.</div>
      ) : (
        <div className="card overflow-hidden p-0">
          {team.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 border-b border-walshe-line px-5 py-4 last:border-0"
            >
              <span
                aria-hidden
                className="grid h-9 w-9 flex-none place-items-center rounded-full bg-walshe-teal text-[13px] font-semibold text-white"
              >
                {initialsOf(m)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-walshe-ink">{m.email}</p>
                {m.display_name && (
                  <p className="truncate text-small text-walshe-grey">{m.display_name}</p>
                )}
              </div>
              <span className={m.approved ? "chip-verified" : "chip-draft"}>
                {m.approved ? "Active" : "Pending"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

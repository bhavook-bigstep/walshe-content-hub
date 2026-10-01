"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, setAccess, type Entry } from "../../../../lib/api";
import { getEntry, upsertEntry } from "../../../../lib/provider-store";

/** Parse "1, 2, 3" into unique positive integers; null when any token is invalid. */
function parseIds(text: string): number[] | null {
  const tokens = text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const ids: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t) || Number(t) <= 0) return null;
    if (!ids.includes(Number(t))) ids.push(Number(t));
  }
  return ids;
}

export default function ProviderEntryPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);
  const [brandSafe, setBrandSafe] = useState(false);
  const [tenants, setTenants] = useState("");
  const [agents, setAgents] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const found = getEntry(id);
    setEntry(found);
    if (found) setBrandSafe(found.brand_safe);
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const tenantIds = parseIds(tenants);
    const agentIds = parseIds(agents);
    if (tenantIds === null || agentIds === null) {
      setError("Access lists must be comma-separated positive ids, e.g. 1, 2.");
      return;
    }
    setBusy(true);
    try {
      const updated = await setAccess(id, {
        brand_safe: brandSafe,
        allowed_tenant_ids: tenantIds,
        allowed_agent_ids: agentIds,
      });
      upsertEntry(updated);
      setEntry(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save access settings.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 block w-full rounded border border-slate-300 px-3 py-2";

  return (
    <main className="max-w-xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{entry ? entry.title : "Entry access"}</h1>
        <Link href="/provider/catalog" className="text-sm underline">
          My catalog
        </Link>
      </div>

      {entry === undefined && (
        <p role="status" className="text-sm text-slate-600">
          Loading entry...
        </p>
      )}
      {entry === null && <p className="text-sm text-slate-600">Entry not found in your catalog on this device.</p>}
      {entry && (
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-xs text-slate-500">
            {entry.type} · {entry.destination}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={brandSafe} onChange={(e) => setBrandSafe(e.target.checked)} />
            Mark as brand-safe
          </label>
          <label className="block text-sm">
            Allowed tenant ids (comma separated)
            <input value={tenants} onChange={(e) => setTenants(e.target.value)} className={input} />
          </label>
          <label className="block text-sm">
            Allowed agent ids (comma separated)
            <input value={agents} onChange={(e) => setAgents(e.target.value)} className={input} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm text-green-700">
              Access settings saved.
            </p>
          )}
          <button type="submit" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save access"}
          </button>
        </form>
      )}
    </main>
  );
}

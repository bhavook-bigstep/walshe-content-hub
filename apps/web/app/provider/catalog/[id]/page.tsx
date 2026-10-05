"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../../../components/ui/PageHeader";
import { ApiError, sendBackEntry, setAccess, type Entry } from "../../../../lib/api";
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
  const [reason, setReason] = useState("");
  const [sendingBack, setSendingBack] = useState(false);

  useEffect(() => {
    const found = getEntry(id);
    setEntry(found);
    if (found) setBrandSafe(found.brand_safe);
  }, [id]);

  async function onSendBack() {
    if (!reason.trim()) {
      setError("Add a reason so the owner knows what to fix.");
      return;
    }
    setError(null);
    setSendingBack(true);
    try {
      const updated = await sendBackEntry(id, reason.trim());
      upsertEntry(updated);
      setEntry(updated);
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the entry back.");
    } finally {
      setSendingBack(false);
    }
  }

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

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: "Home", href: "/provider" },
          { label: "My catalog", href: "/provider/catalog" },
          { label: entry ? entry.title : "Entry access" },
        ]}
        title={entry ? entry.title : "Entry access"}
        description={entry ? `${entry.type} · ${entry.destination}` : undefined}
        action={
          <Link href="/provider/catalog" className="btn-ghost">
            My catalog
          </Link>
        }
      />

      {entry === undefined && <div className="card h-48 animate-pulse bg-walshe-stone/60" aria-hidden />}
      {entry === null && (
        <div className="card p-8 text-center text-body text-walshe-grey">
          Entry not found in your catalog on this device.
        </div>
      )}
      {entry && (
        <section aria-label="Review status" className="card mb-6 space-y-4 p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-h3 text-[1.0625rem] text-walshe-ink">Review status</h2>
            <span
              data-testid="entry-status"
              className={entry.status === "approved" ? "chip-verified capitalize" : "chip-draft capitalize"}
            >
              {entry.display_status.replaceAll("_", " ")}
            </span>
          </div>
          {entry.review_reason ? (
            <div
              data-testid="review-reason"
              className="rounded-md border border-walshe-warn/50 bg-walshe-warn/10 p-4 text-small"
            >
              <p className="font-semibold text-walshe-ink">Sent back for changes</p>
              <p className="mt-1 text-walshe-grey">{entry.review_reason}</p>
            </div>
          ) : (
            <p className="text-small text-walshe-grey">
              Not ready to approve? Send it back to draft with a note on what to fix.
            </p>
          )}
          <label className="block">
            <span className="label">Reason to send back</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="field-area text-small"
              placeholder="e.g. Add captions to the hero image."
              aria-label="Reason to send back"
            />
          </label>
          <button type="button" onClick={() => void onSendBack()} disabled={sendingBack} className="btn-secondary">
            {sendingBack ? "Sending back…" : "Send back for changes"}
          </button>
        </section>
      )}

      {entry && (
        <form onSubmit={onSubmit} className="card space-y-5 p-7">
          <label className="flex items-start gap-3 rounded-md border border-walshe-line bg-walshe-mist/50 p-4 text-body">
            <input
              type="checkbox"
              checked={brandSafe}
              onChange={(e) => setBrandSafe(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded-sm accent-[color:rgb(var(--walshe-teal))]"
            />
            <span>
              <span className="font-semibold text-walshe-ink">Mark as brand-safe</span>
              <span className="block text-small text-walshe-grey">Only brand-safe, approved content reaches the trade.</span>
            </span>
          </label>
          <label className="block">
            <span className="label">Allowed tenant ids (comma separated)</span>
            <input value={tenants} onChange={(e) => setTenants(e.target.value)} className="field" placeholder="1, 2" />
          </label>
          <label className="block">
            <span className="label">Allowed agent ids (comma separated)</span>
            <input value={agents} onChange={(e) => setAgents(e.target.value)} className="field" placeholder="3, 4" />
          </label>
          {error && (
            <p role="alert" className="text-small font-medium text-walshe-danger">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="chip-verified w-fit">
              Access settings saved.
            </p>
          )}
          <div className="border-t border-walshe-line pt-5">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : "Save access"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

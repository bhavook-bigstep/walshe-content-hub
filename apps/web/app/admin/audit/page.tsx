"use client";

import { useEffect, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import { ApiError, fetchAuditCsv, listAudit, type AuditEntry } from "../../../lib/api";

// AC37 — the audit trail. Every traceable action (approve, unpublish, send-back, delete,
// blocklist change, publish) is recorded and can be exported.
const ACTION_LABEL: Record<string, string> = {
  unpublish: "Unpublished",
  overwrite: "Changed access",
  delete: "Deleted",
  send_back: "Sent back",
  publish: "Published",
  blocklist_add: "Off-limits added",
  blocklist_remove: "Off-limits removed",
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAudit()
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load the audit log."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const blob = await fetchAuditCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-log.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not export the audit log.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/admin" }, { label: "Audit log" }]}
        title="Audit log"
        description="Every change, send-back, withdrawal, publish and off-limits update across the hub — traceable and exportable."
        action={
          <button type="button" onClick={() => void exportCsv()} disabled={exporting} className="btn-secondary">
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        }
      />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      {rows === null ? (
        <div className="card h-48 animate-pulse bg-walshe-stone/60" aria-hidden />
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-body text-walshe-grey">
          No recorded actions yet. Traceable actions will appear here as they happen.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table data-testid="audit-table" className="w-full text-left text-small">
            <thead>
              <tr className="border-b border-walshe-line bg-walshe-mist/60 text-walshe-grey">
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">When</th>
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">Action</th>
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">Target</th>
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">Actor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-walshe-line/70 last:border-0">
                  <td className="px-5 py-3.5 text-walshe-grey">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3.5 font-medium text-walshe-ink">
                    {ACTION_LABEL[r.action] ?? r.action}
                  </td>
                  <td className="px-5 py-3.5 text-walshe-grey">
                    {r.target_type.replace("_", " ")} #{r.target_id}
                  </td>
                  <td className="px-5 py-3.5 text-walshe-grey">User #{r.actor_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

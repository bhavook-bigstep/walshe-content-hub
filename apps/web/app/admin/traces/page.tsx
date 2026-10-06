"use client";

import { useEffect, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import { ApiError, listTraces, type AgentRunTrace } from "../../../lib/api";

// AC45 — the agent-run trace view. Content-free: kind/intent/provider/latency/outcome, no prompts.
const KIND_LABEL: Record<string, string> = {
  assistant: "Assistant",
  plan: "Creative plan",
  knowledge: "Knowledge",
};

export default function TracesPage() {
  const [rows, setRows] = useState<AgentRunTrace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTraces()
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load traces."));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/admin" }, { label: "Traces" }]}
        title="Agent traces"
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
          No agent runs yet. Traces appear here as agents use the assistant and the studio.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table data-testid="traces-table" className="w-full text-left text-small">
            <thead>
              <tr className="border-b border-walshe-line bg-walshe-mist/60 text-walshe-grey">
                {["When", "Kind", "Intent", "Provider", "Latency", "Outcome"].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-walshe-line/70 last:border-0">
                  <td className="px-5 py-3.5 text-walshe-grey">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3.5 font-medium text-walshe-ink">{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td className="px-5 py-3.5 text-walshe-grey">{r.intent || "—"}</td>
                  <td className="px-5 py-3.5 capitalize text-walshe-grey">{r.provider || "—"}</td>
                  <td className="px-5 py-3.5 tabular-nums text-walshe-grey">{r.latency_ms} ms</td>
                  <td className="px-5 py-3.5">
                    <span className={r.outcome === "ok" ? "chip-verified" : "chip-draft"}>{r.outcome}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

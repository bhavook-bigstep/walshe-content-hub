"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "../../../components/ui/PageHeader";
import { listDesignTemplates, type DesignTemplate } from "../../../lib/api";

// Preset starting points for the Design Studio (AC28). Agent-only; the API re-checks the role.
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<DesignTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTemplates(await listDesignTemplates());
    } catch (e) {
      setTemplates([]);
      setError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = templates === null;

  return (
    <div>
      <PageHeader title="Templates" description="Start a design from a preset." />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      {loading && !error ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-48 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="card card-hover p-6">
              <span className="chip-draft">{t.format}</span>
              <h3 className="mt-3 text-h3 font-semibold text-walshe-ink">{t.name}</h3>
              <p className="mt-1 text-small text-walshe-grey">{t.description}</p>
              <Link href={`/agent/studio?template=${t.id}`} className="btn-primary mt-2 inline-flex">
                Use template
              </Link>
            </div>
          ))}
        </div>
      ) : (
        !error && (
          <div className="card p-8 text-center text-walshe-grey">No templates available yet.</div>
        )
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "../../../components/ui/Dialog";
import PageHeader from "../../../components/ui/PageHeader";
import { createProject, listDesignTemplates, type DesignTemplate } from "../../../lib/api";

// Preset starting points for the Design Studio (AC28). Agent-only; the API re-checks the role.
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

// A simple format illustration for the preview (templates carry no image/design today).
const FORMAT_RATIO: Record<string, string> = {
  social: "aspect-square",
  story: "aspect-[9/16]",
  pamphlet: "aspect-[3/4]",
  carousel: "aspect-[4/3]",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<DesignTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DesignTemplate | null>(null);
  const router = useRouter();

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

  const [using, setUsing] = useState<string | null>(null);
  // Using a template creates a project seeded from its full workspace, then opens it in the studio;
  // the workspace engine loads the template's scenes like any other project.
  const useTemplate = useCallback(
    async (t: DesignTemplate) => {
      setUsing(t.id);
      try {
        const project = await createProject({ name: t.name, format: t.format, template_id: t.id });
        router.push(`/agent/studio?project=${project.id}`);
      } catch (e) {
        setError(messageOf(e));
        setUsing(null);
      }
    },
    [router],
  );

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
            <div key={t.id} className="card group relative overflow-hidden p-6">
              <span className="chip-draft">{t.format}</span>
              <h3 className="mt-3 text-h3 font-semibold text-walshe-ink">{t.name}</h3>
              <p className="mt-1 text-small text-walshe-grey">{t.description}</p>
              {/* AC62 — hover reveals Preview + Use instead of opening on click. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-walshe-ink/60 opacity-0 backdrop-blur-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                <button type="button" className="btn-secondary" onClick={() => setPreview(t)}>Preview</button>
                <button type="button" className="btn-primary" disabled={using === t.id} onClick={() => void useTemplate(t)}>
                  {using === t.id ? "Opening…" : "Use"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !error && (
          <div className="card p-8 text-center text-walshe-grey">No templates available yet.</div>
        )
      )}

      {preview && (
        <Dialog title={preview.name} open onClose={() => setPreview(null)}>
          <div className="space-y-4">
            <span className="chip-draft">{preview.format}</span>
            <div className={`mx-auto w-40 rounded-sm border-2 border-dashed border-walshe-line bg-walshe-stone/40 ${FORMAT_RATIO[preview.format] ?? "aspect-square"}`} aria-hidden />
            <p className="text-small text-walshe-grey">{preview.description}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setPreview(null)}>Close</button>
              <button type="button" className="btn-primary" disabled={using === preview.id} onClick={() => void useTemplate(preview)}>
                {using === preview.id ? "Opening…" : "Use template"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

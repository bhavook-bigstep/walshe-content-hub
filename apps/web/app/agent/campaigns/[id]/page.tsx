"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../../../components/ui/PageHeader";
import {
  ApiError, getCampaign, getProject, listProjects, patchCampaignPost, scheduleCampaignPost,
  type CampaignDetail, type CampaignPost, type Project,
} from "../../../../lib/api";
import { bucketByLocalDay, monthCells, STATUS_CHIP } from "../../../../lib/campaigns/calendar";
import {
  buildCampaignPatchForm, buildCampaignPostForm, CAMPAIGN_PLATFORMS, localInputToOffsetISO,
} from "../../../../lib/campaigns/form";
import { migrateDesign } from "../../../../lib/studio/ops";
import { renderDesignToJpegBlob } from "../../../../lib/studio/render";

const pad = (n: number) => String(n).padStart(2, "0");
const cellKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ISO → datetime-local value (viewer's local time), to prefill the edit form.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignDetailPage() {
  const id = Number(useParams().id);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [platform, setPlatform] = useState(CAMPAIGN_PLATFORMS[0].value);
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CampaignPost | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editWhen, setEditWhen] = useState("");

  const reload = useCallback(
    () => getCampaign(id).then(setCampaign)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the campaign.")),
    [id],
  );

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    listProjects().then((p) => {
      setProjects(p);
      if (p[0]) setProjectId(String(p[0].id));
    }).catch(() => {});
  }, []);

  const byDay = useMemo(() => bucketByLocalDay(campaign?.posts ?? []), [campaign]);

  // Month navigation bounded to the campaign window (campaigns can span months).
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  useEffect(() => {
    if (campaign && !view) {
      const s = new Date(campaign.starts_on);
      setView({ year: s.getFullYear(), month: s.getMonth() });
    }
  }, [campaign, view]);
  const idx = (y: number, m: number) => y * 12 + m;
  const bStart = campaign ? new Date(campaign.starts_on) : null;
  const bEnd = campaign ? new Date(campaign.ends_on) : null;
  const canPrev = !!(view && bStart && idx(view.year, view.month) > idx(bStart.getFullYear(), bStart.getMonth()));
  const canNext = !!(view && bEnd && idx(view.year, view.month) < idx(bEnd.getFullYear(), bEnd.getMonth()));
  const shift = (d: number) =>
    setView((v) => (v ? { year: v.year + Math.floor((v.month + d) / 12), month: ((v.month + d) % 12 + 12) % 12 } : v));
  const cells = view ? monthCells(view.year, view.month) : [];

  async function onSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const project = await getProject(Number(projectId));
      const design = migrateDesign(project.design);
      if (!design) throw new Error("This project has no usable design to render.");
      const jpeg = await renderDesignToJpegBlob(design, 0);
      const form = buildCampaignPostForm({
        compositionId: Number(projectId), caption, platform,
        scheduledAtISO: scheduledAt ? localInputToOffsetISO(scheduledAt) : null, jpeg,
      });
      await scheduleCampaignPost(id, form);
      setCaption(""); setScheduledAt("");
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "Could not schedule the post."));
    } finally {
      setBusy(false);
    }
  }

  function openEdit(p: CampaignPost) {
    setSelected(p);
    setEditCaption(p.caption);
    setEditWhen(isoToLocalInput(p.scheduled_at));
  }

  async function onSaveEdit(unschedule: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await patchCampaignPost(id, selected.id, buildCampaignPatchForm({
        // An empty multipart value reads as absent server-side, so clearing uses clear_caption.
        caption: editCaption === "" ? undefined : editCaption,
        clearCaption: editCaption === "",
        unschedule,
        scheduledAtISO: unschedule ? null : (editWhen ? localInputToOffsetISO(editWhen) : null),
      }));
      setSelected(null);
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={campaign?.name ?? "Campaign"}
        description={campaign ? `${campaign.starts_on} → ${campaign.ends_on}` : ""} />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      <form onSubmit={onSchedule} className="card mb-8 flex flex-wrap items-end gap-4 p-6" aria-busy={busy}>
        <label className="flex flex-col gap-1">
          <span className="label">Project</span>
          <select className="field" aria-label="Project" value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name || `Project #${p.id}`}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Platform</span>
          <select className="field" aria-label="Platform" value={platform}
                  onChange={(e) => setPlatform(e.target.value)}>
            {CAMPAIGN_PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Caption</span>
          <input className="field" aria-label="Caption" value={caption}
                 onChange={(e) => setCaption(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">When</span>
          <input type="datetime-local" className="field" aria-label="Scheduled at"
                 value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary h-12" disabled={busy || !projectId}>
          {busy ? "Scheduling…" : "Schedule post"}
        </button>
      </form>

      <section className="card p-5" aria-label="Calendar" data-testid="campaign-calendar">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" className="btn-ghost" disabled={!canPrev} onClick={() => shift(-1)}>
            ← Prev
          </button>
          <span className="font-semibold text-walshe-ink">
            {view
              ? new Date(view.year, view.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
              : ""}
          </span>
          <button type="button" className="btn-ghost" disabled={!canNext} onClick={() => shift(1)}>
            Next →
          </button>
        </div>
        <div className="mb-3 grid grid-cols-7 gap-2 text-small text-walshe-grey">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`pad-${i}`} className="min-h-20 rounded-sm bg-walshe-stone/30" aria-hidden />;
            const key = cellKey(cell);
            const posts = byDay.get(key) ?? [];
            const inWindow = !!campaign && key >= campaign.starts_on && key <= campaign.ends_on;
            return (
              <div key={key}
                   className={`min-h-20 rounded-sm border border-walshe-line p-1.5 ${inWindow ? "" : "opacity-40"}`}>
                <div className="text-[11px] text-walshe-grey">{cell.getDate()}</div>
                {posts.map((p) => (
                  <button key={p.id} type="button" onClick={() => openEdit(p)}
                    className={`mt-1 block w-full truncate rounded px-1 text-left text-[11px] ${STATUS_CHIP[p.status] ?? ""}`}>
                    {p.caption || `Post #${p.id}`}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {selected && (
        <section className="card mt-6 p-5" aria-label="Edit post" data-testid="edit-post-panel">
          <h2 className="mb-3 text-h3 font-bold text-walshe-ink">Edit post</h2>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="label">Caption</span>
              <input className="field" aria-label="Edit caption" value={editCaption}
                     onChange={(e) => setEditCaption(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">When</span>
              <input type="datetime-local" className="field" aria-label="Edit scheduled at"
                     value={editWhen} onChange={(e) => setEditWhen(e.target.value)} />
            </label>
            <button type="button" className="btn-primary h-12" disabled={busy}
                    onClick={() => void onSaveEdit(false)}>Save changes</button>
            <button type="button" className="btn-secondary h-12" disabled={busy}
                    onClick={() => void onSaveEdit(true)}>Unschedule</button>
            <button type="button" className="btn-ghost h-12" onClick={() => setSelected(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

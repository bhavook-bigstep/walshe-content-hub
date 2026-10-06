// Pure FormData builders for scheduling/editing a campaign post (mirrors lib/studio/instagram.ts).

export interface CampaignPostFormInput {
  compositionId: number;
  caption: string;
  scheduledAtISO: string | null;
  jpeg: Blob;
}

export function buildCampaignPostForm(input: CampaignPostFormInput): FormData {
  const form = new FormData();
  form.append("composition_id", String(input.compositionId));
  form.append("caption", input.caption);
  if (input.scheduledAtISO) form.append("scheduled_at", input.scheduledAtISO);
  form.append("image", new File([input.jpeg], "post.jpg", { type: "image/jpeg" }));
  return form;
}

// Convert a <input type="datetime-local"> value (the viewer's wall-clock time, "YYYY-MM-DDTHH:mm")
// to an OFFSET-AWARE ISO string that keeps that wall time and appends the viewer's UTC offset.
// NOT new Date(x).toISOString() — that converts to a 'Z' instant, which would make the API validate
// the campaign window against the UTC date instead of the viewer's local date (design §4.1).
export function localInputToOffsetISO(local: string): string {
  const d = new Date(local); // parsed as local time
  const offMin = -d.getTimezoneOffset(); // e.g. +330 for IST, DST-correct for this date
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${off}`
  );
}

export interface CampaignPatchInput {
  caption?: string;
  clearCaption?: boolean;
  scheduledAtISO?: string | null; // offset-aware ISO to set; ignored when `unschedule` is true
  unschedule?: boolean;
  jpeg?: Blob | null; // optional replacement render (not surfaced in the Inc 1 UI)
}

export function buildCampaignPatchForm(input: CampaignPatchInput): FormData {
  const form = new FormData();
  if (input.caption !== undefined) form.append("caption", input.caption);
  if (input.clearCaption) form.append("clear_caption", "true");
  if (input.unschedule) form.append("unschedule", "true");
  else if (input.scheduledAtISO) form.append("scheduled_at", input.scheduledAtISO);
  if (input.jpeg) form.append("image", new File([input.jpeg], "post.jpg", { type: "image/jpeg" }));
  return form;
}

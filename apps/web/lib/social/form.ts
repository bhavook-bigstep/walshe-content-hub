// Pure FormData builder for scheduling a real social (Instagram) post — mirrors lib/campaigns/form.ts.
// The composition's design is rendered to a JPEG client-side (renderDesignToJpegBlob) and captured
// here so the server can publish it through the shared Instagram path on approve.

export interface SocialPostFormInput {
  compositionId: number;
  channel: string;
  /** ISO-8601 planning time, or null to default to now server-side. */
  scheduledAtISO: string | null;
  jpeg: Blob;
}

export function buildSocialPostForm(input: SocialPostFormInput): FormData {
  const form = new FormData();
  form.append("composition_id", String(input.compositionId));
  form.append("channel", input.channel);
  if (input.scheduledAtISO) form.append("scheduled_at", input.scheduledAtISO);
  form.append("image", new File([input.jpeg], "post.jpg", { type: "image/jpeg" }));
  return form;
}

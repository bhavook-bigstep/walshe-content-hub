// Build the multipart body for POST /social/instagram/publish from the Studio's state.
// Kept pure (no Fabric/DOM) so it is unit-testable without a canvas.

export interface PublishFormInput {
  compositionId: number;
  caption: string;
  jpeg: Blob;
}

export function buildPublishForm({ compositionId, caption, jpeg }: PublishFormInput): FormData {
  const form = new FormData();
  form.append("composition_id", String(compositionId));
  form.append("caption", caption);
  form.append("image", new File([jpeg], "post.jpg", { type: "image/jpeg" }));
  return form;
}

// Server-side render of scene stills (PNG) so an agent can SEE what it built. Runs the same frames.ts
// renderer as the editor inside a headless Chromium (lib/studio/render-browser.ts).
//
// POST body: {
//   design,                         DesignDoc (untrusted JSON; migrated/validated here)
//   sceneIndex?,                    scene to render (default 0; clamped)
//   times?: number[],               ms offsets within the scene (default: start/mid/end + transition boundary)
//   allowedCatalogIds?: string[],   Contract 1: the only catalog ids an image node may reference
//   imageSrcById?: { [id]: src }    server-resolved srcs; override whatever the design carries
// }
// → { pngs: dataURL[], width, height, broken_images: nodeId[] }
// Broken images are a reported FACT (broken_images), not a render error. Failures are typed:
// { error: "timeout" | "browser_crash" | "bad_workspace" | "budget_exhausted" | "src_not_allowed" }.
// The Contract-1 src allowlist is enforced BEFORE Chromium is launched.
import { migrateDesign, type DesignDoc } from "../../../../lib/studio/ops";
import { sampleTimesForScene } from "../../../../lib/studio/frames";
import {
  RenderError,
  buildEgressAllowlist,
  isEgressAllowed,
  renderStills,
  type RenderErrorCode,
} from "../../../../lib/studio/render-browser";

export const runtime = "nodejs";

const STATUS: Record<RenderErrorCode | "src_not_allowed", number> = {
  bad_workspace: 400,
  src_not_allowed: 403,
  budget_exhausted: 429,
  browser_crash: 502,
  timeout: 504,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function fail(code: RenderErrorCode | "src_not_allowed", message?: string): Response {
  return json({ error: code, ...(message ? { message } : {}) }, STATUS[code]);
}

/** Contract 1 gate. Returns an offending node id, or null when every image src is permitted.
 * Mutates `design` so catalog images carry the server-resolved src (never the caller's). */
function checkImageSources(
  design: DesignDoc,
  allowedIds: ReadonlySet<string> | undefined,
  srcById: Record<string, string> | undefined,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  for (const scene of design.scenes) {
    for (const node of scene.nodes) {
      if (node.type !== "image") continue;
      if (node.catalogItemId !== undefined) {
        const id = String(node.catalogItemId);
        if (allowedIds && !allowedIds.has(id)) return node.id;
        if (srcById && typeof srcById[id] === "string") node.src = srcById[id];
      }
      const srcs = [node.src, node.videoSrc, ...(node.frames ?? [])];
      for (const s of srcs) {
        if (typeof s === "string" && s && !isEgressAllowed(s, allowedOrigins)) return node.id;
      }
    }
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("bad_workspace", "invalid JSON body");
  }
  const design = migrateDesign(body.design);
  if (!design) return fail("bad_workspace", "invalid or missing design");

  const sceneIndex = Math.max(
    0,
    Math.min(Number.isInteger(body.sceneIndex) ? (body.sceneIndex as number) : 0, design.scenes.length - 1),
  );
  const scene = design.scenes[sceneIndex];

  let times: number[];
  if (body.times === undefined) {
    times = sampleTimesForScene(scene);
  } else if (
    Array.isArray(body.times) &&
    body.times.every((t) => typeof t === "number" && Number.isFinite(t) && t >= 0)
  ) {
    times = body.times as number[];
  } else {
    return fail("bad_workspace", "times must be an array of non-negative numbers");
  }

  const origin = process.env.RENDER_ORIGIN || new URL(req.url).origin;
  const allowedIds = Array.isArray(body.allowedCatalogIds)
    ? new Set((body.allowedCatalogIds as unknown[]).map(String))
    : undefined;
  const srcById =
    body.imageSrcById && typeof body.imageSrcById === "object"
      ? (body.imageSrcById as Record<string, string>)
      : undefined;

  // Contract 1: reject BEFORE any browser is launched.
  const bad = checkImageSources(design, allowedIds, srcById, buildEgressAllowlist(origin));
  if (bad) return fail("src_not_allowed", `image node ${bad} references content outside the approved set`);

  try {
    const res = await renderStills({ design, sceneIndex, times }, { origin });
    return json(res);
  } catch (e) {
    if (e instanceof RenderError) return fail(e.code);
    return fail("browser_crash");
  }
}

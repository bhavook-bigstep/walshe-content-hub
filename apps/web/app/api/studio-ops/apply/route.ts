// Node service for the studio-ops agentic tool core: apply a sequence of op calls to a design,
// server-side, over HTTP — so any host (the in-app Builder, a future MCP server, a CLI) can drive the
// Studio through one validated, grounded entry point. Runs the SAME pure TS ops the web app uses (one
// source of truth, no duplication). Pure + deterministic.
//
// POST body: {
//   design,                      the DesignDoc to edit (untrusted JSON; migrated/validated here)
//   sceneIndex?,                 scene the ops target (default 0; clamped)
//   calls: StudioOpCall[],       the op sequence
//   allowedCatalogIds?: string[],   Contract 1: the only ids the caller may reference (omit = no gate)
//   imageSrcById?: { [id]: src }    resolved served image srcs (the studio never fabricates one)
//   spriteFramesById?: { [ref]: { frames, fps?, width, height } }  agent-generated sprites, by ref
// }
// → { design, results, valid }. The CALLER is responsible for resolving allowedCatalogIds +
// imageSrcById from the authed agent's visible catalog (the FastAPI visibility choke-point) before
// calling — this endpoint is the pure op-apply engine, not the auth boundary.
import { migrateDesign } from "../../../../lib/studio/ops";
import { applyStudioOps, type StudioOpCall } from "../../../../lib/studio/studio-ops";

export const runtime = "nodejs";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  // Migrate/validate the incoming design before touching it (buildability guard on input).
  const design = migrateDesign(body.design);
  if (!design) return json({ error: "invalid or missing design" }, 400);

  if (!Array.isArray(body.calls)) return json({ error: "calls must be an array" }, 400);
  const calls = body.calls as StudioOpCall[];

  const sceneIndex = Number.isInteger(body.sceneIndex) ? (body.sceneIndex as number) : 0;
  const allowed = Array.isArray(body.allowedCatalogIds)
    ? new Set((body.allowedCatalogIds as unknown[]).map(String))
    : undefined;
  const srcMap =
    body.imageSrcById && typeof body.imageSrcById === "object"
      ? (body.imageSrcById as Record<string, string>)
      : undefined;
  const spriteMap =
    body.spriteFramesById && typeof body.spriteFramesById === "object"
      ? (body.spriteFramesById as Record<string, { frames: string[]; fps?: number; width: number; height: number }>)
      : undefined;

  const result = applyStudioOps(design, calls, {
    sceneIndex: Math.max(0, Math.min(sceneIndex, design.scenes.length - 1)),
    allowedCatalogIds: allowed,
    imageSrcFor: srcMap ? (id) => srcMap[id] : undefined,
    spriteFramesFor: spriteMap ? (ref) => spriteMap[ref] : undefined,
  });
  return json(result);
}

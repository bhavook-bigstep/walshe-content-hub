// Observe the workspace in WORDS: derive an accurate natural-language description of each scene from
// its structured state, so an agent can read what the canvas looks like instead of analysing a
// render. Pure + deterministic — recomputed from the design on every call, so it never goes stale.
//
// POST body: {
//   design,                      the DesignDoc to observe (untrusted JSON; migrated/validated here)
//   sceneIndex?,                 observe only this scene (omit = all scenes)
//   labelsById?: { [id]: title } catalog id → title, so placed images read by name (optional)
// }
// → { format, width, height, sceneCount, scenes: [{ index, name, description, ... }] }
import { migrateDesign } from "../../../../lib/studio/ops";
import { observeDesign } from "../../../../lib/studio/describe";

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

  const design = migrateDesign(body.design);
  if (!design) return json({ error: "invalid or missing design" }, 400);

  const labels =
    body.labelsById && typeof body.labelsById === "object"
      ? (body.labelsById as Record<string, string>)
      : undefined;

  const observation = observeDesign(design, labels);
  if (Number.isInteger(body.sceneIndex)) {
    const i = body.sceneIndex as number;
    observation.scenes = observation.scenes.filter((s) => s.index === i);
  }
  return json(observation);
}

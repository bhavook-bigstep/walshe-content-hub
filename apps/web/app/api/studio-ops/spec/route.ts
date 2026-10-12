// The studio-ops tool catalog, served so any host (the in-app Builder, an MCP adapter, a CLI) can
// discover the available ops + their params and build its tool list. Static data — no auth needed.
import { STUDIO_OPS_SPEC } from "../../../../lib/studio/studio-ops";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ops: STUDIO_OPS_SPEC }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

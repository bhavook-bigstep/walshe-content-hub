// Dev-only proxy for the video-render endpoint.
//
// The same-origin `/api/*` proxy is a Next.js rewrite (next.config.mjs). Rewrites drop very large
// request bodies — the WYSIWYG frame upload for a multi-scene video is many MB — and `next start`
// returns 500 before the request ever reaches the API (so the studio shows "Video rendering
// unavailable"). This route handler sits in front of that one path and forwards the full body to
// the API with no size cap, so large renders work in dev. In prod/e2e the client talks to an
// absolute API URL and never hits `/api`, so this handler is inert there.
import { type NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // long renders

const TARGET = process.env.API_PROXY_TARGET || "http://localhost:8000";

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.arrayBuffer(); // route handlers have no 1 MB body cap (unlike pages API)
  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") ?? "application/json",
  };
  const auth = req.headers.get("authorization");
  if (auth) headers.authorization = auth;

  const res = await fetch(`${TARGET}/render/video-frames`, { method: "POST", headers, body });
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" },
  });
}

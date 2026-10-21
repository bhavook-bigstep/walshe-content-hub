import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deflateSync, inflateSync } from "node:zlib";
import { POST } from "../app/api/studio-ops/render/route";
import {
  MAX_STILLS_PER_REQUEST,
  __setBrowserLauncherForTests,
  buildEgressAllowlist,
  isEgressAllowed,
  renderStills,
  type RenderBrowserLike,
  type RenderPageLike,
  type RenderRouteLike,
} from "../lib/studio/render-browser";
import { sampleTimesForScene } from "../lib/studio/frames";
import { addCatalogImage, newDesign } from "../lib/studio/ops";

// The browser boundary is mocked; no Chromium is launched. Assertions are STRUCTURAL (PNG signature,
// dimensions, non-blank) — never exact pixels. Synthetic fixtures only.

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makePng(w: number, h: number): string {
  const crc = (buf: Buffer): number => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8-bit grayscale
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(w + 1);
    for (let x = 0; x < w; x++) row[x + 1] = (x * 7 + y * 13) % 256; // deterministic non-blank gradient
    rows.push(row);
  }
  const png = Buffer.concat([
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

function pngInfo(dataUrl: string): { width: number; height: number; distinct: number } {
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  expect(buf.subarray(0, 8).equals(SIG)).toBe(true);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const idatAt = buf.indexOf("IDAT");
  const len = buf.readUInt32BE(idatAt - 4);
  const raw = inflateSync(buf.subarray(idatAt + 4, idatAt + 4 + len));
  return { width, height, distinct: new Set(raw).size };
}

interface Fake {
  launches: number;
  aborted: string[];
}
const newFake = (): Fake => ({ launches: 0, aborted: [] });

type Behave = (job: Record<string, unknown>) => Promise<unknown>;

/** A fake browser whose page.evaluate runs `behave(job)`; goto replays two requests through the route
 * interceptor (one same-origin, one foreign) so egress blocking is observable. */
function fakeLauncher(fake: Fake, behave: Behave) {
  return async (): Promise<RenderBrowserLike> => {
    fake.launches++;
    let connected = true;
    return {
      isConnected: () => connected,
      on: () => undefined,
      close: async () => {
        connected = false;
      },
      newContext: async () => {
        let handler: ((r: RenderRouteLike) => unknown) | null = null;
        return {
          route: async (_p, h) => void (handler = h),
          close: async () => undefined,
          newPage: async () => ({
            goto: async () => {
              for (const u of ["http://localhost:3000/chunk.js", "https://evil.example/x.png"]) {
                await handler?.({
                  request: () => ({ url: () => u }),
                  continue: async () => undefined,
                  abort: async () => void fake.aborted.push(u),
                });
              }
            },
            waitForFunction: async () => undefined,
            evaluate: (async (_fn: unknown, job: Record<string, unknown>) => behave(job)) as unknown as RenderPageLike["evaluate"],
          }),
        };
      },
    };
  };
}

const okResult: Behave = async (job) => ({
  pngs: (job.times as number[]).map(() => makePng(64, 48)),
  width: 64,
  height: 48,
  broken_images: ["img-9"],
});

function post(body: unknown): Promise<Response> {
  return POST(new Request("http://localhost:3000/api/studio-ops/render", { method: "POST", body: JSON.stringify(body) }));
}
const code = async (r: Response) => ((await r.json()) as { error: string }).error;

// The render egress trust anchor is the FIXED server-config RENDER_ORIGIN, never the request Host
// (Contract 2 / SSRF). Pin it for the POST tests; the fail-closed test clears it explicitly.
const PINNED_ORIGIN = "http://localhost:3000";
beforeEach(() => {
  process.env.RENDER_ORIGIN = PINNED_ORIGIN;
});
afterEach(() => {
  __setBrowserLauncherForTests(null);
  process.env.RENDER_ORIGIN = PINNED_ORIGIN;
});

describe("sampleTimesForScene", () => {
  it("test_samples_start_mid_end_and_transition_boundary", () => {
    expect(sampleTimesForScene({ durationMs: 4000, transition: "fade" })).toEqual([0, 2000, 3500, 3999]);
  });
  it("test_no_transition_boundary_when_none", () => {
    expect(sampleTimesForScene({ durationMs: 4000, transition: "none" })).toEqual([0, 2000, 3999]);
  });
  it("test_deterministic_and_deduped_for_tiny_scenes", () => {
    const a = sampleTimesForScene({ durationMs: 1, transition: "fade" });
    expect(a).toEqual(sampleTimesForScene({ durationMs: 1, transition: "fade" }));
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("egress allowlist (Contract 2)", () => {
  const allowed = buildEgressAllowlist("http://localhost:3000", "http://minio:9000, not a url");
  it("test_allows_app_origin_extra_origin_and_inert_schemes", () => {
    expect(isEgressAllowed("http://localhost:3000/a.js", allowed)).toBe(true);
    expect(isEgressAllowed("http://minio:9000/b/x.png", allowed)).toBe(true);
    expect(isEgressAllowed("data:image/png;base64,AAAA", allowed)).toBe(true);
    expect(isEgressAllowed("blob:http://localhost:3000/1", allowed)).toBe(true);
  });
  it("test_blocks_foreign_origins_other_schemes_and_garbage", () => {
    expect(isEgressAllowed("https://evil.example/x.png", allowed)).toBe(false);
    expect(isEgressAllowed("http://localhost:3001/x", allowed)).toBe(false);
    expect(isEgressAllowed("file:///etc/passwd", allowed)).toBe(false);
    expect(isEgressAllowed("nonsense", allowed)).toBe(false);
  });
});

describe("POST /api/studio-ops/render", () => {
  it("test_returns_structurally_valid_pngs_reports_broken_images_and_blocks_egress", async () => {
    const fake = newFake();
    __setBrowserLauncherForTests(fakeLauncher(fake, okResult));
    const res = await post({ design: newDesign("social"), times: [0, 500] });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { pngs: string[]; width: number; height: number; broken_images: string[] };
    expect(data.pngs).toHaveLength(2);
    for (const png of data.pngs) {
      const info = pngInfo(png);
      expect(info.width).toBe(data.width);
      expect(info.height).toBe(data.height);
      expect(info.distinct).toBeGreaterThan(1); // non-blank
    }
    expect(data.broken_images).toEqual(["img-9"]); // a reported fact, not an error
    expect(fake.aborted).toEqual(["https://evil.example/x.png"]);
  });

  it("test_default_times_come_from_sampleTimesForScene", async () => {
    __setBrowserLauncherForTests(fakeLauncher(newFake(), okResult));
    const data = (await (await post({ design: newDesign("social") })).json()) as { pngs: string[] };
    expect(data.pngs).toHaveLength(sampleTimesForScene(newDesign("social").scenes[0]).length);
  });

  it("test_rejects_unapproved_catalog_id_before_launching_browser", async () => {
    const fake = newFake();
    __setBrowserLauncherForTests(fakeLauncher(fake, okResult));
    const design = addCatalogImage(newDesign("social"), 0, { src: "blob:served/9.png", catalogItemId: "9" });
    const res = await post({ design, allowedCatalogIds: ["7"] });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("src_not_allowed");
    expect(fake.launches).toBe(0);
  });

  it("test_rejects_foreign_origin_src_before_launching_browser", async () => {
    const fake = newFake();
    __setBrowserLauncherForTests(fakeLauncher(fake, okResult));
    const design = addCatalogImage(newDesign("social"), 0, { src: "https://evil.example/p.png", catalogItemId: "7" });
    const res = await post({ design, allowedCatalogIds: ["7"] });
    expect(res.status).toBe(403);
    expect(fake.launches).toBe(0);
  });

  it("test_server_resolved_src_overrides_caller_src", async () => {
    let seen: { design: { scenes: { nodes: { src?: string }[] }[] } } | null = null;
    __setBrowserLauncherForTests(
      fakeLauncher(newFake(), async (job) => {
        seen = job as unknown as typeof seen;
        return okResult(job);
      }),
    );
    const design = addCatalogImage(newDesign("social"), 0, { src: "https://evil.example/p.png", catalogItemId: "7" });
    const res = await post({
      design,
      times: [0],
      allowedCatalogIds: ["7"],
      imageSrcById: { "7": "data:image/png;base64,AAAA" },
    });
    expect(res.status).toBe(200);
    expect(seen!.design.scenes[0].nodes.find((n) => n.src)?.src).toBe("data:image/png;base64,AAAA");
  });

  it("test_bad_body_design_and_times_are_bad_workspace", async () => {
    const r1 = await POST(new Request("http://x/api", { method: "POST", body: "{nope" }));
    expect(r1.status).toBe(400);
    expect(await code(r1)).toBe("bad_workspace");
    expect((await post({ design: { scenes: [] } })).status).toBe(400);
    expect((await post({ design: newDesign("social"), times: [-1] })).status).toBe(400);
  });

  it("test_too_many_stills_is_budget_exhausted_without_launch", async () => {
    const fake = newFake();
    __setBrowserLauncherForTests(fakeLauncher(fake, okResult));
    const times = Array.from({ length: MAX_STILLS_PER_REQUEST + 1 }, (_, i) => i);
    const res = await post({ design: newDesign("social"), times });
    expect(res.status).toBe(429);
    expect(await code(res)).toBe("budget_exhausted");
    expect(fake.launches).toBe(0);
  });

  it("test_page_bad_workspace_error_maps_to_typed_code", async () => {
    __setBrowserLauncherForTests(
      fakeLauncher(newFake(), async () => {
        throw new Error("page.evaluate: Error: bad_workspace");
      }),
    );
    const res = await post({ design: newDesign("social"), times: [0] });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("bad_workspace");
  });

  it("test_crash_maps_to_browser_crash_and_next_request_relaunches", async () => {
    const fake = newFake();
    let crash = true;
    __setBrowserLauncherForTests(
      fakeLauncher(fake, async (job) => {
        if (crash) throw new Error("Target page, context or browser has been closed");
        return okResult(job);
      }),
    );
    const r1 = await post({ design: newDesign("social"), times: [0] });
    expect(r1.status).toBe(502);
    expect(await code(r1)).toBe("browser_crash");
    crash = false;
    expect((await post({ design: newDesign("social"), times: [0] })).status).toBe(200);
    expect(fake.launches).toBe(2); // relaunched after the crash
  });

  it("test_launch_failure_is_browser_crash", async () => {
    __setBrowserLauncherForTests(async () => {
      throw new Error("no chromium");
    });
    const res = await post({ design: newDesign("social"), times: [0] });
    expect(res.status).toBe(502);
    expect(await code(res)).toBe("browser_crash");
  });

  it("test_hung_render_hits_hard_timeout", async () => {
    __setBrowserLauncherForTests(fakeLauncher(newFake(), () => new Promise(() => undefined)));
    await expect(
      renderStills(
        { design: newDesign("social"), sceneIndex: 0, times: [0] },
        { origin: "http://localhost:3000", timeoutMs: 20 },
      ),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("test_timeout_keeps_the_shared_singleton_for_concurrent_renders", async () => {
    // One render hangs (scene 0) and hits the hard timeout; a concurrent render (scene 1) must NOT
    // be killed by it — the timeout branch must leave the shared singleton browser up. Regression
    // for the critical-patterns.md shared-state-under-concurrency hazard in the render layer.
    const fake = newFake();
    const behave: Behave = (job) =>
      (job.sceneIndex as number) === 0 ? new Promise(() => undefined) : okResult(job);
    __setBrowserLauncherForTests(fakeLauncher(fake, behave));
    const hang = renderStills(
      { design: newDesign("social"), sceneIndex: 0, times: [0] },
      { origin: "http://localhost:3000", timeoutMs: 20 },
    );
    await expect(hang).rejects.toMatchObject({ code: "timeout" });
    // The sibling render reuses the SAME singleton (no relaunch) and still succeeds.
    const res = await renderStills(
      { design: newDesign("social"), sceneIndex: 1, times: [0] },
      { origin: "http://localhost:3000", timeoutMs: 5000 },
    );
    expect(res.pngs).toHaveLength(1);
    expect(fake.launches).toBe(1); // timeout did NOT close/relaunch the shared browser
  });

  it("test_same_input_gives_identical_output", async () => {
    __setBrowserLauncherForTests(fakeLauncher(newFake(), okResult));
    const a = await (await post({ design: newDesign("social"), times: [0, 100] })).text();
    const b = await (await post({ design: newDesign("social"), times: [0, 100] })).text();
    expect(a).toBe(b);
  });

  it("test_hostile_host_header_cannot_seed_the_egress_allowlist", async () => {
    // Contract-2 / SSRF regression. RENDER_ORIGIN is unset here, so the ONLY thing that could seed the
    // egress allowlist is the request itself. Before the fix the trust anchor was
    // `process.env.RENDER_ORIGIN || new URL(req.url).origin`: with RENDER_ORIGIN unset, a caller who
    // sets `Host: 169.254.169.254` made the cloud-metadata endpoint a permitted egress origin, so the
    // metadata src below passed the Contract-1 gate and the headless browser became an SSRF relay (200).
    // The fix reads RENDER_ORIGIN only and FAILS CLOSED (500 misconfigured) — the Host is never trusted,
    // so this request is refused before any browser launches. This assertion fails against the
    // vulnerable variant (which would 200), unlike the previous pinned-env version that passed on both.
    delete process.env.RENDER_ORIGIN;
    const fake = newFake();
    __setBrowserLauncherForTests(fakeLauncher(fake, okResult));
    const design = addCatalogImage(newDesign("social"), 0, {
      src: "http://169.254.169.254/latest/meta-data/",
      catalogItemId: "7",
    });
    const res = await POST(
      new Request("http://169.254.169.254/api/studio-ops/render", {
        method: "POST",
        headers: { host: "169.254.169.254" },
        body: JSON.stringify({ design, allowedCatalogIds: ["7"] }),
      }),
    );
    expect(res.status).toBe(500);
    expect(await code(res)).toBe("misconfigured");
    expect(fake.launches).toBe(0); // never reached a browser
  });

  it("test_fails_closed_when_render_origin_unset", async () => {
    // No RENDER_ORIGIN → the route must refuse rather than trust the request Host.
    delete process.env.RENDER_ORIGIN;
    const fake = newFake();
    __setBrowserLauncherForTests(fakeLauncher(fake, okResult));
    const res = await post({ design: newDesign("social"), times: [0] });
    expect(res.status).toBe(500);
    expect(await code(res)).toBe("misconfigured");
    expect(fake.launches).toBe(0);
  });
});

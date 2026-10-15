// Server-side render path: a lazy singleton headless Chromium (one per Next.js process) that loads the
// headless-only page /studio/%5Frender and rasterises scene stills through the SAME frames.ts
// renderer the editor uses. Guarantees:
//   - hard per-request timeout; a crashed/disconnected browser is dropped and relaunched next call
//   - readiness gate (fonts + image decode) lives in the page; viewport / DPR / locale / timezone fixed
//   - animation clock is SEEKED (explicit atMs per still) — never free-running
//   - Contract 2 defence-in-depth: every request Chromium makes is intercepted; anything outside the
//     allowlist (app origin + RENDER_EGRESS_ALLOWLIST origins; data:/blob: always) is aborted
//   - bounded work: stills-per-request and concurrent renders are capped (budget_exhausted)
// The Contract-1 src allowlist is enforced by the route BEFORE this module is reached.

export type RenderErrorCode = "timeout" | "browser_crash" | "bad_workspace" | "budget_exhausted";

export class RenderError extends Error {
  constructor(
    public readonly code: RenderErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "RenderError";
  }
}

export interface RenderJob {
  design: unknown;
  sceneIndex: number;
  times: number[];
}
export interface RenderResult {
  pngs: string[];
  width: number;
  height: number;
  broken_images: string[];
}

export const RENDER_TIMEOUT_MS = 30_000;
export const MAX_STILLS_PER_REQUEST = 12;
export const MAX_CONCURRENT_RENDERS = 2;
export const RENDER_PAGE_PATH = "/studio/%5Frender";

// Minimal structural types over playwright so the boundary is mockable and typing stays local.
export interface RenderRequestLike {
  url(): string;
}
export interface RenderRouteLike {
  request(): RenderRequestLike;
  continue(): Promise<void>;
  abort(): Promise<void>;
}
export interface RenderPageLike {
  goto(url: string, opts?: { timeout?: number }): Promise<unknown>;
  waitForFunction(fn: string, arg?: unknown, opts?: { timeout?: number }): Promise<unknown>;
  evaluate(fn: (job: RenderJob) => unknown, arg: RenderJob): Promise<unknown>;
}
export interface RenderContextLike {
  route(pattern: string, handler: (route: RenderRouteLike) => unknown): Promise<void>;
  newPage(): Promise<RenderPageLike>;
  close(): Promise<void>;
}
export interface RenderBrowserLike {
  newContext(opts: Record<string, unknown>): Promise<RenderContextLike>;
  isConnected(): boolean;
  on(event: "disconnected", cb: () => void): unknown;
  close(): Promise<void>;
}
export type BrowserLauncher = () => Promise<RenderBrowserLike>;

const defaultLauncher: BrowserLauncher = async () => {
  const pw = (await import("playwright")) as unknown as {
    chromium: { launch(o: Record<string, unknown>): Promise<RenderBrowserLike> };
  };
  return pw.chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
};

let launcher: BrowserLauncher = defaultLauncher;
let browserPromise: Promise<RenderBrowserLike> | null = null;
let inFlight = 0;

/** Test seam: swap the browser boundary (pass null to restore) and reset singleton state. */
export function __setBrowserLauncherForTests(l: BrowserLauncher | null): void {
  launcher = l ?? defaultLauncher;
  browserPromise = null;
  inFlight = 0;
}

async function getBrowser(): Promise<RenderBrowserLike> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.isConnected()) return b;
    browserPromise = null; // crashed / disconnected: relaunch
  }
  const p = launcher();
  browserPromise = p;
  try {
    const b = await p;
    b.on("disconnected", () => {
      if (browserPromise === p) browserPromise = null;
    });
    return b;
  } catch (e) {
    if (browserPromise === p) browserPromise = null;
    throw new RenderError("browser_crash", `browser launch failed: ${errMsg(e)}`);
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Origins Chromium may fetch from: the app itself + RENDER_EGRESS_ALLOWLIST (comma-separated URLs). */
export function buildEgressAllowlist(appOrigin: string, extra: string | undefined = process.env.RENDER_EGRESS_ALLOWLIST): Set<string> {
  const out = new Set<string>([appOrigin]);
  for (const raw of (extra ?? "").split(",")) {
    const s = raw.trim();
    if (!s) continue;
    try {
      out.add(new URL(s).origin);
    } catch {
      /* ignore malformed entry: fail closed (not allowed) */
    }
  }
  return out;
}

/** True when a request URL may leave the headless browser. data:/blob:/about: are inert and local. */
export function isEgressAllowed(url: string, allowedOrigins: ReadonlySet<string>): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return true;
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return allowedOrigins.has(u.origin);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const t = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new RenderError("timeout", `render exceeded ${ms}ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

function classify(e: unknown): RenderError {
  if (e instanceof RenderError) return e;
  const m = errMsg(e);
  if (m.includes("bad_workspace")) return new RenderError("bad_workspace");
  if (/closed|crash|disconnected|Target page/i.test(m)) return new RenderError("browser_crash", m);
  return new RenderError("browser_crash", m);
}

export interface RenderOptions {
  /** origin of the running Next.js app (Chromium loads the render page from it) */
  origin: string;
  timeoutMs?: number;
  extraAllowedOrigins?: string;
}

/** Render stills for one scene. Throws RenderError with a typed code on any failure. */
export async function renderStills(job: RenderJob, opts: RenderOptions): Promise<RenderResult> {
  if (job.times.length === 0 || job.times.length > MAX_STILLS_PER_REQUEST) {
    throw new RenderError("budget_exhausted", `times must be 1..${MAX_STILLS_PER_REQUEST}`);
  }
  if (inFlight >= MAX_CONCURRENT_RENDERS) throw new RenderError("budget_exhausted", "too many concurrent renders");
  inFlight++;
  const timeoutMs = opts.timeoutMs ?? RENDER_TIMEOUT_MS;
  let ctx: RenderContextLike | null = null;
  let used: RenderBrowserLike | null = null;
  try {
    return await withTimeout(
      (async () => {
        const browser = await getBrowser();
        used = browser;
        const allowed = buildEgressAllowlist(opts.origin, opts.extraAllowedOrigins ?? process.env.RENDER_EGRESS_ALLOWLIST);
        ctx = await browser.newContext({
          viewport: { width: 1280, height: 1280 },
          deviceScaleFactor: 1,
          locale: "en-US",
          timezoneId: "UTC",
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        await ctx.route("**/*", (route) =>
          isEgressAllowed(route.request().url(), allowed) ? route.continue() : route.abort(),
        );
        const page = await ctx.newPage();
        await page.goto(new URL(RENDER_PAGE_PATH, opts.origin).toString(), { timeout: timeoutMs });
        await page.waitForFunction("window.__studioRenderReady === true", undefined, { timeout: timeoutMs });
        const res = (await page.evaluate(
          (j) => (window as unknown as { __studioRender: (j: RenderJob) => Promise<unknown> }).__studioRender(j),
          job,
        )) as RenderResult;
        return res;
      })(),
      timeoutMs,
    );
  } catch (e) {
    const err = classify(e);
    if (err.code === "browser_crash" || err.code === "timeout") {
      browserPromise = null; // force relaunch on the next request
      await (used as RenderBrowserLike | null)?.close().catch(() => undefined); // don't leak the old one
    }
    throw err;
  } finally {
    inFlight--;
    if (ctx) await (ctx as RenderContextLike).close().catch(() => undefined);
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowed, redirectFor, requiredRole } from "../lib/rbac";
import {
  clear,
  getRole,
  getToken,
  hasValidSession,
  isExpired,
  msUntilExpiry,
  setSession,
} from "../lib/session";
import {
  ApiError,
  buildCatalogQuery,
  configureClient,
  fetchAssetObjectUrl,
  listAgentCatalog,
  login,
} from "../lib/api";

// A syntactically valid JWT (header.payload.signature) carrying only the fields we read.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}
const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const PAST = Math.floor(Date.now() / 1000) - 3600;

function stubStorage(throwing = false) {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      if (throwing) throw new Error("blocked");
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throwing) throw new Error("blocked");
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("rbac", () => {
  it("maps route prefixes to roles on segment boundaries", () => {
    expect(requiredRole("/admin")).toBe("super_admin");
    expect(requiredRole("/provider/entries")).toBe("content_provider");
    expect(requiredRole("/agent/studio")).toBe("tourism_agent");
    expect(requiredRole("/administrator")).toBeNull();
    expect(requiredRole("/login")).toBeNull();
  });
  it("allowed() enforces role per route", () => {
    expect(allowed("/admin/users", "super_admin")).toBe(true);
    expect(allowed("/admin/users", "tourism_agent")).toBe(false);
    expect(allowed("/agent", null)).toBe(false);
    expect(allowed("/login", null)).toBe(true);
  });
  it("redirectFor: login when anonymous, role home on cross-role, pass otherwise", () => {
    expect(redirectFor("/agent", null)).toBe("/login");
    expect(redirectFor("/admin", "tourism_agent")).toBe("/agent");
    expect(redirectFor("/provider/x", "super_admin")).toBe("/admin");
    expect(redirectFor("/agent/x", "tourism_agent")).toBeNull();
    expect(redirectFor("/login", null)).toBeNull();
    expect(redirectFor("/login", "content_provider")).toBe("/provider");
  });
});

describe("session", () => {
  it("stores and clears token + role", () => {
    stubStorage();
    setSession("tok-fake", "tourism_agent");
    expect(getToken()).toBe("tok-fake");
    expect(getRole()).toBe("tourism_agent");
    clear();
    expect(getToken()).toBeNull();
    expect(getRole()).toBeNull();
  });
  it("rejects unknown stored roles and survives blocked storage", () => {
    stubStorage();
    localStorage.setItem("walsh.role", "root");
    expect(getRole()).toBeNull();
    stubStorage(true);
    expect(getToken()).toBeNull();
    expect(() => setSession("t", "super_admin")).not.toThrow();
    expect(() => clear()).not.toThrow();
  });
});

describe("session expiry (auth guard)", () => {
  it("isExpired reads the JWT exp; missing/garbage exp is treated as not-expired", () => {
    expect(isExpired(fakeJwt({ exp: PAST }))).toBe(true);
    expect(isExpired(fakeJwt({ exp: FUTURE }))).toBe(false);
    expect(isExpired(fakeJwt({ sub: 1 }))).toBe(false); // no exp claim
    expect(isExpired("not-a-jwt")).toBe(false);
  });

  it("hasValidSession requires a present, unexpired token AND a role", () => {
    stubStorage();
    expect(hasValidSession()).toBe(false); // nothing stored
    setSession(fakeJwt({ exp: FUTURE }), "tourism_agent");
    expect(hasValidSession()).toBe(true);
    expect(msUntilExpiry()).toBeGreaterThan(0);
    // An expired token is not a valid session even though a role is stored.
    setSession(fakeJwt({ exp: PAST }), "tourism_agent");
    expect(hasValidSession()).toBe(false);
  });
});

describe("api client", () => {
  beforeEach(() => stubStorage());

  it("builds catalog query strings", () => {
    expect(buildCatalogQuery({})).toBe("");
    expect(buildCatalogQuery({ destination: "Bali", type: "event", q: "a b" })).toBe(
      "?destination=Bali&type=event&q=a+b",
    );
  });
  it("sends bearer header on authed calls and none on login", async () => {
    setSession("tok-fake", "tourism_agent");
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await listAgentCatalog({ q: "x" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/catalog\?q=x$/);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-fake");

    fetchMock.mockResolvedValueOnce(new Response('{"access_token":"t2"}', { status: 200 }));
    expect(await login("a@example.test", "pw")).toBe("t2");
    const [, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(init2.headers).get("Authorization")).toBeNull();
  });
  it("maps errors to ApiError without leaking the token", async () => {
    setSession("tok-secret-fake", "tourism_agent");
    vi.stubGlobal("fetch", async () => new Response('{"detail":"Invalid credentials"}', { status: 401 }));
    const err = await login("a", "b").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("Invalid credentials");
    expect(String(err.message)).not.toContain("tok-secret-fake");
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("down");
    });
    const net = await login("a", "b").catch((e) => e);
    expect(net.status).toBe(0);
  });
  it("calls onUnauthorized on an authenticated 401, but not on an unauthed login 401", async () => {
    setSession(fakeJwt({ exp: FUTURE }), "tourism_agent");
    const onUnauthorized = vi.fn();
    configureClient({ onUnauthorized });

    vi.stubGlobal("fetch", async () => new Response('{"detail":"Invalid or expired token"}', { status: 401 }));
    await listAgentCatalog({}).catch(() => {}); // authenticated call → should end the session
    expect(onUnauthorized).toHaveBeenCalledOnce();

    onUnauthorized.mockClear();
    await login("a", "b").catch(() => {}); // login is unauthenticated → must not redirect
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("fetchAssetObjectUrl: authed fetch -> blob -> object URL", async () => {
    setSession("tok-fake", "tourism_agent");
    const fetchMock = vi.fn(async () => new Response(new Blob(["x"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const create = vi.fn(() => "blob:fake");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create }));
    expect(await fetchAssetObjectUrl("entries/1/a b.png")).toBe("blob:fake");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toMatch(/\/assets\/entries\/1\/a%20b\.png$/);
    expect(create).toHaveBeenCalledOnce();
  });
});

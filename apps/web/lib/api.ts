// Typed client over the FastAPI surface. Never logs the bearer token or provider keys (Contract 2).
import { getToken } from "./session";
import type { Role } from "./rbac";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type CatalogType = "event" | "place" | "opportunity" | "offer" | "itinerary";
export type EntryStatus = string;

export interface User {
  id: number;
  email: string;
  role: Role;
  tenant_id: number | null;
  approved: boolean;
}
export interface Entry {
  id: number;
  type: CatalogType;
  title: string;
  description: string;
  destination: string;
  market_tags: string[];
  status: EntryStatus;
  brand_safe: boolean;
  provider_id: number;
}
export interface EntryCreate {
  type: CatalogType;
  title: string;
  description?: string;
  destination: string;
  market_tags?: string[];
}
export interface AccessUpdate {
  brand_safe?: boolean;
  status?: EntryStatus;
  allowed_tenant_ids?: number[];
  allowed_agent_ids?: number[];
}
export interface CatalogQuery {
  destination?: string;
  type?: CatalogType;
  q?: string;
}

/** Error carrying only status + server detail text; never request headers or tokens. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function detailOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* non-JSON error body */
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function send(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = auth ? getToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Network error: could not reach the API");
  }
  if (!res.ok) throw new ApiError(res.status, await detailOf(res));
  return res;
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function buildCatalogQuery(p: CatalogQuery): string {
  const qs = new URLSearchParams();
  if (p.destination) qs.set("destination", p.destination);
  if (p.type) qs.set("type", p.type);
  if (p.q) qs.set("q", p.q);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function login(email: string, password: string): Promise<string> {
  const res = await send("/auth/login", json({ email, password }), false);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function me(): Promise<User> {
  return (await (await send("/auth/me")).json()) as User;
}

export async function listAgentCatalog(p: CatalogQuery = {}): Promise<Entry[]> {
  return (await (await send(`/catalog${buildCatalogQuery(p)}`)).json()) as Entry[];
}

export async function getEntry(id: number): Promise<Entry> {
  return (await (await send(`/catalog/${id}`)).json()) as Entry;
}

export async function createEntry(body: EntryCreate): Promise<Entry> {
  return (await (await send("/catalog", json(body))).json()) as Entry;
}

export async function setAccess(id: number, body: AccessUpdate): Promise<Entry> {
  const init = { ...json(body), method: "PATCH" };
  return (await (await send(`/catalog/${id}`, init)).json()) as Entry;
}

export async function uploadImage(
  id: number,
  file: File,
): Promise<{ object_key: string; content_type: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await send(`/catalog/${id}/image`, { method: "POST", body: form });
  return (await res.json()) as { object_key: string; content_type: string };
}

export async function listUsers(): Promise<User[]> {
  return (await (await send("/admin/users")).json()) as User[];
}

export async function approveProvider(userId: number): Promise<User> {
  const res = await send(`/admin/providers/${userId}/approve`, { method: "POST" });
  return (await res.json()) as User;
}

export async function renderPdf(design: Record<string, unknown>): Promise<Blob> {
  return (await send("/render/pdf", json({ design }))).blob();
}

export async function renderEmailHtml(design: Record<string, unknown>): Promise<string> {
  const res = await send("/render/email-html", json({ design }));
  return ((await res.json()) as { html: string }).html;
}

/** Assets need the bearer header, so <img src> cannot hit the API directly: authed fetch -> blob -> object URL. */
export async function fetchAssetObjectUrl(key: string): Promise<string> {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  const blob = await (await send(`/assets/${encoded}`)).blob();
  return URL.createObjectURL(blob);
}

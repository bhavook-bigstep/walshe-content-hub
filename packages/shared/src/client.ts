// Typed client over the FastAPI surface. Never logs the bearer token or provider keys (Contract 2).
// Types come from the generated ./api-types (derived from the Pydantic models); never hand-written here.
import type { components } from "./api-types";

type Schemas = components["schemas"];
export type Entry = Schemas["EntryOut"];
export type EntryCreate = Schemas["EntryCreate"];
export type EntryContentUpdate = Schemas["EntryContentUpdate"];
export type CustomSection = Schemas["CustomSection"];
export type ContentTemplates = Schemas["ContentTemplates"];
export type TemplateField = Schemas["TemplateField"];
export type MediaItem = Schemas["MediaItem"];
export type TeamMember = Schemas["TeamMember"];
export type TeamInvite = Schemas["TeamInvite"];
export type Performance = Schemas["PerformanceOut"];
export type Project = Schemas["ProjectOut"];
export type ProjectCreate = Schemas["ProjectCreate"];
export type ProjectUpdate = Schemas["ProjectUpdate"];
export type Collection = Schemas["CollectionOut"];
export type CollectionCreate = Schemas["CollectionCreate"];
export type CollectionUpdate = Schemas["CollectionUpdate"];
export type BrandKit = Schemas["BrandKitOut"];
export type BrandKitUpdate = Schemas["BrandKitUpdate"];
export type DesignTemplate = Schemas["DesignTemplate"];
export type AccessUpdate = Schemas["AccessUpdate"];
export type SendBackRequest = Schemas["SendBackRequest"];
export type Preflight = Schemas["PreflightOut"];
export type PreflightIssue = Schemas["PreflightIssueOut"];
export type BlocklistTerm = Schemas["BlocklistOut"];
export type AuditEntry = Schemas["AuditOut"];
export type AssistantReply = Schemas["AssistantOut"];
export type AssistantItem = Schemas["ItemCardOut"];
export type CreativePlan = Schemas["CreativePlanOut"];
export type User = Schemas["UserOut"];
export type AdminCreateUserInput = Schemas["AdminCreateUserRequest"];
export type RegisterProviderInput = Schemas["RegisterProviderRequest"];
export type ProfileUpdateInput = Schemas["ProfileUpdate"];
export type Organization = Schemas["OrganizationOut"];
export type OrganizationUpdateInput = Schemas["OrganizationUpdate"];
export type CatalogType = Entry["type"];
export type EntryStatus = Entry["status"];
export type DesignRequest = Schemas["DesignRequest"];
export type VideoRequest = Schemas["VideoRequest"];
export type ScheduleRequest = Schemas["ScheduleRequest"];
export type PublishRequest = Schemas["PublishRequest"];
export type Post = Schemas["PostOut"];
export type Engagement = Schemas["EngagementOut"];

export let API_URL: string =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let tokenProvider: () => string | null = () => null;
let onUnauthorized: (() => void) | null = null;

/** The host app injects where the bearer token lives, the API base URL, and an optional handler
 *  invoked when an *authenticated* request is rejected 401 (token missing/expired/invalid) so the
 *  app can end the session and route to sign-in rather than surface a raw "invalid token". */
export function configureClient(opts: {
  getToken?: () => string | null;
  apiUrl?: string;
  onUnauthorized?: () => void;
}): void {
  if (opts.getToken) tokenProvider = opts.getToken;
  if (opts.apiUrl) API_URL = opts.apiUrl;
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized;
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
  const token = auth ? tokenProvider() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Network error: could not reach the API");
  }
  if (!res.ok) {
    // An authenticated call rejected 401 means the session is no longer valid — let the host end it.
    if (res.status === 401 && auth && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, await detailOf(res));
  }
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

/** Public self-registration (AC24): creates a Tourism Agent and returns a bearer token. */
export async function register(email: string, password: string): Promise<string> {
  const res = await send("/auth/register", json({ email, password }), false);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Provider self-registration (AC25): creates a PENDING provider and returns a bearer token. */
export async function registerProvider(body: RegisterProviderInput): Promise<string> {
  const res = await send("/auth/register/provider", json(body), false);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Update the signed-in user's profile (AC27). */
export async function updateProfile(body: ProfileUpdateInput): Promise<User> {
  return (await (await send("/auth/me", { ...json(body), method: "PATCH" })).json()) as User;
}

/** The signed-in provider's organization profile (AC27). */
export async function getOrganization(): Promise<Organization> {
  return (await (await send("/me/organization")).json()) as Organization;
}

export async function updateOrganization(body: OrganizationUpdateInput): Promise<Organization> {
  const init = { ...json(body), method: "PATCH" };
  return (await (await send("/me/organization", init)).json()) as Organization;
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

/** Self-describing structured-field schema per content type (AC29). */
export async function getContentTemplates(): Promise<ContentTemplates> {
  return (await (await send("/catalog/templates", {}, false)).json()) as ContentTemplates;
}

/** Edit an entry's structured content (AC29). */
export async function updateEntryContent(id: number, body: EntryContentUpdate): Promise<Entry> {
  const init = { ...json(body), method: "PUT" };
  return (await (await send(`/catalog/${id}`, init)).json()) as Entry;
}

/** Provider media library — every asset across the provider's entries (AC29). */
export async function listMedia(): Promise<MediaItem[]> {
  return (await (await send("/me/media")).json()) as MediaItem[];
}

/** Provider team members in the same organization (AC29). */
export async function listTeam(): Promise<TeamMember[]> {
  return (await (await send("/me/team")).json()) as TeamMember[];
}

export async function inviteMember(body: TeamInvite): Promise<User> {
  return (await (await send("/me/team", json(body))).json()) as User;
}

/** How agents use this provider's content (AC29). */
export async function getPerformance(): Promise<Performance> {
  return (await (await send("/me/performance")).json()) as Performance;
}

// --- Agent features (AC28) ---
export async function listProjects(): Promise<Project[]> {
  return (await (await send("/me/projects")).json()) as Project[];
}
export async function getProject(id: number): Promise<Project> {
  return (await (await send(`/me/projects/${id}`)).json()) as Project;
}
export async function createProject(body: ProjectCreate): Promise<Project> {
  return (await (await send("/me/projects", json(body))).json()) as Project;
}
export async function updateProject(id: number, body: ProjectUpdate): Promise<Project> {
  return (await (await send(`/me/projects/${id}`, { ...json(body), method: "PUT" })).json()) as Project;
}
export async function deleteProject(id: number): Promise<void> {
  await send(`/me/projects/${id}`, { method: "DELETE" });
}

export async function listCollections(): Promise<Collection[]> {
  return (await (await send("/me/collections")).json()) as Collection[];
}
export async function createCollection(body: CollectionCreate): Promise<Collection> {
  return (await (await send("/me/collections", json(body))).json()) as Collection;
}
export async function updateCollection(id: number, body: CollectionUpdate): Promise<Collection> {
  return (await (await send(`/me/collections/${id}`, { ...json(body), method: "PUT" })).json()) as Collection;
}
export async function deleteCollection(id: number): Promise<void> {
  await send(`/me/collections/${id}`, { method: "DELETE" });
}

export async function getBrandKit(): Promise<BrandKit> {
  return (await (await send("/me/brand-kit")).json()) as BrandKit;
}
export async function updateBrandKit(body: BrandKitUpdate): Promise<BrandKit> {
  return (await (await send("/me/brand-kit", { ...json(body), method: "PUT" })).json()) as BrandKit;
}

export async function listDesignTemplates(): Promise<DesignTemplate[]> {
  return (await (await send("/me/design-templates")).json()) as DesignTemplate[];
}

/** Reviewer returns an entry to its owner with a reason (AC35); entry drops to draft. */
export async function sendBackEntry(id: number, reason: string): Promise<Entry> {
  return (await (await send(`/catalog/${id}/send-back`, json({ reason }))).json()) as Entry;
}

// --- Off-limits blocklist (AC36) ---
export async function listBlocklist(): Promise<BlocklistTerm[]> {
  return (await (await send("/blocklist")).json()) as BlocklistTerm[];
}
export async function addBlocklistTerm(term: string): Promise<BlocklistTerm> {
  return (await (await send("/blocklist", json({ term }))).json()) as BlocklistTerm;
}
export async function removeBlocklistTerm(id: number): Promise<void> {
  await send(`/blocklist/${id}`, { method: "DELETE" });
}

// --- Creative Plan IR (AC41/42) ---
export async function buildCreativePlan(
  itemIds: number[],
  opts: { objective?: string; format?: string; audience?: string } = {},
): Promise<CreativePlan> {
  const body = { item_ids: itemIds, ...opts };
  return (await (await send("/builder/plan", json(body))).json()) as CreativePlan;
}

// --- Assistant & discovery (AC38-40) ---
export async function askAssistant(message: string): Promise<AssistantReply> {
  return (await (await send("/assistant", json({ message }))).json()) as AssistantReply;
}
export async function listSuggestions(): Promise<AssistantItem[]> {
  const out = (await (await send("/me/suggestions")).json()) as { items: AssistantItem[] };
  return out.items;
}

// --- Audit log (AC37) ---
export async function listAudit(): Promise<AuditEntry[]> {
  return (await (await send("/audit")).json()) as AuditEntry[];
}
/** The audit log as a CSV blob (FR-16 export); the caller turns it into a download. */
export async function fetchAuditCsv(): Promise<Blob> {
  return (await send("/audit/export")).blob();
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

/** Super-Admin user provisioning (AC24): create a Content Provider (with organization) or Agent. */
export async function createUser(body: AdminCreateUserInput): Promise<User> {
  return (await (await send("/admin/users", json(body))).json()) as User;
}

export async function renderPdf(design: Record<string, unknown>): Promise<Blob> {
  return (await send("/render/pdf", json({ design }))).blob();
}

export async function renderEmailHtml(design: Record<string, unknown>): Promise<string> {
  const res = await send("/render/email-html", json({ design }));
  return ((await res.json()) as { html: string }).html;
}

/** AI/builder-generated design (opaque serialisable design model). */
export async function builderDesign(body: DesignRequest): Promise<Record<string, unknown>> {
  return (await (await send("/builder/design", json(body))).json()) as Record<string, unknown>;
}

/** Renders items to an MP4 blob (server never accepts client file paths). */
export async function renderVideo(body: VideoRequest): Promise<Blob> {
  return (await send("/render/video", json(body))).blob();
}

/** Dry-run the pre-send checks (AC34) so the agent sees issues before trying to send. */
export async function preflightSend(compositionId: number, channel: string): Promise<Preflight> {
  const body = { composition_id: compositionId, channel };
  return (await (await send("/social/preflight", json(body))).json()) as Preflight;
}

export async function scheduleSocialPost(body: ScheduleRequest): Promise<Post> {
  return (await (await send("/social/schedule", json(body))).json()) as Post;
}

export async function publishSocialPost(body: PublishRequest): Promise<Post> {
  return (await (await send("/social/publish", json(body))).json()) as Post;
}

export async function listEngagement(): Promise<Engagement[]> {
  return (await (await send("/engagement")).json()) as Engagement[];
}

/** Assets need the bearer header, so <img src> cannot hit the API directly: authed fetch -> blob -> object URL. */
export async function fetchAssetObjectUrl(key: string): Promise<string> {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  const blob = await (await send(`/assets/${encoded}`)).blob();
  return URL.createObjectURL(blob);
}

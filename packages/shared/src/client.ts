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
export type GeoData = Schemas["GeoData"];
export type GeoCountry = Schemas["GeoCountry"];
export type Season = Schemas["Season"];
export type MediaItem = Schemas["MediaItem"];
export type TeamMember = Schemas["TeamMember"];
export type TeamInvite = Schemas["TeamInvite"];
export type Performance = Schemas["PerformanceOut"];
export type Project = Schemas["ProjectOut"];
export type ProjectResolved = Schemas["ProjectResolved"];
export type ProjectCreate = Schemas["ProjectCreate"];
export type ProjectUpdate = Schemas["ProjectUpdate"];
export type WorkspaceResolved = Schemas["WorkspaceResolved"];
export type WorkspaceIn = Schemas["WorkspaceIn"];
export type WorkspaceMetadata = Schemas["WorkspaceMetadata"];
export type ReferenceContent = Schemas["ReferenceContent"];
export type WorkspaceCollection = Schemas["WorkspaceCollection"];
export type ResolvedReferenceContent = Schemas["ResolvedReferenceContent"];
export type ResolvedCollection = Schemas["ResolvedCollection"];
export type AssetRef = Schemas["AssetRef"];
export type EntryRef = Schemas["EntryRef"];
export type Collection = Schemas["CollectionOut"];
export type CollectionResolved = Schemas["CollectionResolved"];
export type UserAsset = Schemas["UserAssetOut"];
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
export type AgentRunTrace = Schemas["AgentRunOut"];
export type AssistantReply = Schemas["AssistantOut"];
export type AssistantItem = Schemas["ItemCardOut"];
export type AssistantTurn = Schemas["HistoryTurn"];
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
export type FramesVideoRequest = Schemas["FramesVideoRequest"];
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
  country?: string;
  state?: string;
  city?: string;
  season?: Season;
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
  if (p.country) qs.set("country", p.country);
  if (p.state) qs.set("state", p.state);
  if (p.city) qs.set("city", p.city);
  if (p.season) qs.set("season", p.season);
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

/** Upload the org logo (jpg/jpeg/png); returns the updated organization (AC58). */
export async function uploadOrgLogo(file: File): Promise<Organization> {
  const form = new FormData();
  form.append("file", file);
  return (await (
    await send("/me/organization/logo", { method: "POST", body: form })
  ).json()) as Organization;
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

/** Edit an entry's content (AC29) — title, location, season, etc. Only provided fields change. */
export async function updateEntry(id: number, body: EntryContentUpdate): Promise<Entry> {
  return (await (await send(`/catalog/${id}`, { ...json(body), method: "PUT" })).json()) as Entry;
}
/** Delete an entry (audited, Contract 3). */
export async function deleteEntry(id: number): Promise<void> {
  await send(`/catalog/${id}`, { method: "DELETE" });
}
export async function createEntry(body: EntryCreate): Promise<Entry> {
  return (await (await send("/catalog", json(body))).json()) as Entry;
}

// Catalog library (AC49).
export type Catalog = Schemas["CatalogOut"];
export type CatalogCreate = Schemas["CatalogCreate"];
export type CatalogUpdate = Schemas["CatalogUpdate"];
export type CatalogVisibility = Catalog["visibility"];
export type AgentRef = Schemas["AgentRef"];

export async function listCatalogs(): Promise<Catalog[]> {
  return (await (await send("/catalogs")).json()) as Catalog[];
}
export async function createCatalog(body: CatalogCreate): Promise<Catalog> {
  return (await (await send("/catalogs", json(body))).json()) as Catalog;
}
export async function updateCatalog(id: number, body: CatalogUpdate): Promise<Catalog> {
  return (await (await send(`/catalogs/${id}`, { ...json(body), method: "PATCH" })).json()) as Catalog;
}
export async function shareCatalog(id: number, shared_agent_ids: number[]): Promise<Catalog> {
  const init = { ...json({ shared_agent_ids }), method: "PUT" };
  return (await (await send(`/catalogs/${id}/share`, init)).json()) as Catalog;
}
export async function listAccessibleCatalogs(): Promise<Catalog[]> {
  return (await (await send("/catalogs/accessible")).json()) as Catalog[];
}

// The provider's single catalog (AC49).
export async function getMyCatalog(): Promise<Catalog> {
  return (await (await send("/catalogs/mine")).json()) as Catalog;
}
export async function updateMyCatalog(body: CatalogUpdate): Promise<Catalog> {
  return (await (await send("/catalogs/mine", { ...json(body), method: "PATCH" })).json()) as Catalog;
}
export async function shareMyCatalog(shared_agent_ids: number[]): Promise<Catalog> {
  const init = { ...json({ shared_agent_ids }), method: "PUT" };
  return (await (await send("/catalogs/mine/share", init)).json()) as Catalog;
}
/** Invite a tourism agent (by email) to the catalog's private entries (AC54). */
export async function inviteAgent(email: string): Promise<Catalog> {
  return (await (await send("/catalogs/mine/invite", json({ email }))).json()) as Catalog;
}
/** Remove an invited agent from the catalog (AC54). */
export async function uninviteAgent(agentId: number): Promise<Catalog> {
  return (await (await send(`/catalogs/mine/invite/${agentId}`, { method: "DELETE" })).json()) as Catalog;
}
/** The provider's own entries (AC50). ``aiCreated`` filters to only AI-generated / only manual (AC68). */
export async function listMyEntries(aiCreated?: boolean): Promise<Entry[]> {
  const qs = aiCreated === undefined ? "" : `?ai_created=${aiCreated}`;
  return (await (await send(`/catalogs/mine/entries${qs}`)).json()) as Entry[];
}

export type Job = Schemas["JobOut"];
/**
 * Auto-Catalog import (AC71): upload a PDF/PNG/JPEG and get back the queued **Job** (202). The
 * extraction → draft-entry work runs asynchronously; poll {@link listJobs} for its status.
 */
export async function importAutoCatalog(file: File): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  return (await (
    await send("/me/auto-catalog/import", { method: "POST", body: form })
  ).json()) as Job;
}
/** The provider's own import jobs, newest first — backs the navbar notification bell (AC74). */
export async function listJobs(): Promise<Job[]> {
  return (await (await send("/me/jobs")).json()) as Job[];
}
export async function listCatalogEntries(catalogId: number): Promise<Entry[]> {
  return (await (await send(`/catalogs/${catalogId}/entries`)).json()) as Entry[];
}

// Entry items (AC50).
export type Item = Schemas["ItemOut"];
export async function listItems(entryId: number): Promise<Item[]> {
  return (await (await send(`/catalog/${entryId}/items`)).json()) as Item[];
}
export async function addTextItem(
  entryId: number,
  body: { text: string; title?: string; order?: number },
): Promise<Item> {
  return (await (await send(`/catalog/${entryId}/items/text`, json(body))).json()) as Item;
}
export async function uploadMediaItem(entryId: number, file: File, title = ""): Promise<Item> {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  return (await (await send(`/catalog/${entryId}/items/media`, { method: "POST", body: form })).json()) as Item;
}
export async function deleteItem(entryId: number, itemId: number): Promise<void> {
  await send(`/catalog/${entryId}/items/${itemId}`, { method: "DELETE" });
}

/** Entry cover photo (AC52): upload a raster image as the entry's card image. */
export async function uploadEntryCover(
  entryId: number,
  file: File,
): Promise<{ cover_object_key: string; content_type: string }> {
  const form = new FormData();
  form.append("file", file);
  return (await (
    await send(`/catalog/${entryId}/cover`, { method: "POST", body: form })
  ).json()) as { cover_object_key: string; content_type: string };
}

/** Entry cover photo (AC52): generate the card image from a prompt via the configured image model. */
export async function generateEntryCover(
  entryId: number,
  prompt: string,
): Promise<{ cover_object_key: string; content_type: string }> {
  return (await (
    await send(`/catalog/${entryId}/cover/generate`, json({ prompt }))
  ).json()) as { cover_object_key: string; content_type: string };
}

/** Self-describing structured-field schema per content type (AC29). */
export async function getContentTemplates(): Promise<ContentTemplates> {
  return (await (await send("/catalog/templates", {}, false)).json()) as ContentTemplates;
}

/** Curated country/state/city hierarchy + fixed season list for forms + filters (AC53). */
export async function getGeo(): Promise<GeoData> {
  return (await (await send("/catalog/geo", {}, false)).json()) as GeoData;
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
/** A project's items resolved against the live catalog (its source collection's entries). */
export async function getProjectResolved(id: number): Promise<ProjectResolved> {
  return (await (await send(`/me/projects/${id}/resolved`)).json()) as ProjectResolved;
}
/** The structured workspace (AC75), resolved: references expanded to live entries + assets. */
export async function getWorkspace(id: number): Promise<WorkspaceResolved> {
  return (await (await send(`/me/projects/${id}/workspace`)).json()) as WorkspaceResolved;
}
/** Autosave the whole workspace (AC75); returns it re-resolved with the bumped version. */
export async function saveWorkspace(id: number, body: WorkspaceIn): Promise<WorkspaceResolved> {
  return (await (
    await send(`/me/projects/${id}/workspace`, { ...json(body), method: "PUT" })
  ).json()) as WorkspaceResolved;
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
/** A collection resolved against the live catalog (AC60): current visible entries + dropped refs. */
export async function resolveCollection(id: number): Promise<CollectionResolved> {
  return (await (await send(`/me/collections/${id}/resolved`)).json()) as CollectionResolved;
}
/** Save an entry reference into a collection (AC59). */
export async function addCollectionItem(id: number, entryId: number): Promise<Collection> {
  return (await (
    await send(`/me/collections/${id}/items`, json({ entry_id: entryId }))
  ).json()) as Collection;
}
/** Remove a saved entry reference from a collection (AC59). */
export async function removeCollectionItem(id: number, entryId: number): Promise<Collection> {
  return (await (
    await send(`/me/collections/${id}/items/${entryId}`, { method: "DELETE" })
  ).json()) as Collection;
}

// Per-user media library (AC51): Local (uploaded) + Agent (AI-generated). Fuels the studio picker.
export async function listMyLibrary(source?: "local" | "agent"): Promise<UserAsset[]> {
  const qs = source ? `?source=${source}` : "";
  return (await (await send(`/me/library${qs}`)).json()) as UserAsset[];
}
export async function uploadLibraryMedia(file: File, title = ""): Promise<UserAsset> {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  return (await (
    await send("/me/library/upload", { method: "POST", body: form })
  ).json()) as UserAsset;
}
export async function generateLibraryMedia(prompt: string): Promise<UserAsset[]> {
  return (await (await send("/me/library/generate", json({ prompt }))).json()) as UserAsset[];
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
export async function askAssistant(
  message: string,
  history: AssistantTurn[] = [],
): Promise<AssistantReply> {
  return (await (await send("/assistant", json({ message, history }))).json()) as AssistantReply;
}
// Streamed assistant (AC65): server-sent events — `delta` text chunks as the reply is generated, then
// one `done` event with the final (authoritative) reply + cards, or an `error` event.
export async function streamAssistant(
  message: string,
  history: AssistantTurn[],
  onDelta: (text: string) => void,
): Promise<AssistantReply> {
  const res = await send("/assistant/stream", json({ message, history }));
  if (!res.body) throw new ApiError(0, "The assistant is unavailable right now.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 2);
      if (!line.startsWith("data:")) continue;
      const event = JSON.parse(line.slice(5)) as
        | { type: "delta"; text: string }
        | ({ type: "done" } & AssistantReply)
        | { type: "error"; message: string };
      if (event.type === "delta") onDelta(event.text);
      else if (event.type === "error") throw new ApiError(0, event.message);
      else return event;
    }
    if (done) throw new ApiError(0, "The assistant is unavailable right now.");
  }
}
export async function listSuggestions(): Promise<AssistantItem[]> {
  const out = (await (await send("/me/suggestions")).json()) as { items: AssistantItem[] };
  return out.items;
}

// --- Agent-run traces (AC45) ---
export async function listTraces(): Promise<AgentRunTrace[]> {
  return (await (await send("/traces")).json()) as AgentRunTrace[];
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

/** WYSIWYG frame-capture video: the client posts pre-rendered animation frames; server encodes. */
export async function renderVideoFrames(body: FramesVideoRequest): Promise<Blob> {
  return (await send("/render/video-frames", json(body))).blob();
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

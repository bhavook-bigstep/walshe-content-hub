// Client session: bearer token + role in localStorage (guarded; may be unavailable).
// A role-only cookie mirrors the role so Edge middleware can route; it never holds the token.
import { isRole, type Role } from "./rbac";

const TOKEN_KEY = "walsh.token";
const ROLE_KEY = "walsh.role";
export const ROLE_COOKIE = "walsh_role";

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage blocked: session simply does not persist */
  }
}

function writeCookie(role: Role | null, maxAgeSeconds?: number): void {
  if (typeof document === "undefined") return;
  if (role === null) {
    document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    return;
  }
  // Tie the cookie's lifetime to the token's: when the JWT expires, the role hint expires too, so
  // the Edge middleware stops an expired session at the route boundary instead of letting it in.
  const maxAge = maxAgeSeconds && maxAgeSeconds > 0 ? `; max-age=${Math.floor(maxAgeSeconds)}` : "";
  document.cookie = `${ROLE_COOKIE}=${role}; path=/${maxAge}; SameSite=Lax`;
}

/** The JWT's `exp` (seconds since epoch) read from its payload, or null if unreadable. */
function tokenExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload || typeof atob === "undefined") return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null; // malformed token → treated as having no usable expiry
  }
}

/** True when `token` carries an `exp` that is at or past now. Tokens without an exp are not expired. */
export function isExpired(token: string): boolean {
  const exp = tokenExp(token);
  return exp !== null && exp * 1000 <= Date.now();
}

/** Milliseconds until the current token expires, or null when there's no token / no expiry. */
export function msUntilExpiry(): number | null {
  const token = getToken();
  if (!token) return null;
  const exp = tokenExp(token);
  return exp === null ? null : Math.max(0, exp * 1000 - Date.now());
}

/** A usable session = a present, unexpired token AND a known role. The guard the UI trusts. */
export function hasValidSession(): boolean {
  const token = getToken();
  if (!token || isExpired(token)) return false;
  return getRole() !== null;
}

export function getToken(): string | null {
  return read(TOKEN_KEY);
}

export function getRole(): Role | null {
  const r = read(ROLE_KEY);
  return isRole(r) ? r : null;
}

export function setToken(token: string): void {
  write(TOKEN_KEY, token);
}

export function setSession(token: string, role: Role): void {
  write(TOKEN_KEY, token);
  write(ROLE_KEY, role);
  const exp = tokenExp(token);
  const remaining = exp === null ? undefined : exp - Math.floor(Date.now() / 1000);
  writeCookie(role, remaining);
}

export function clear(): void {
  write(TOKEN_KEY, null);
  write(ROLE_KEY, null);
  writeCookie(null);
}

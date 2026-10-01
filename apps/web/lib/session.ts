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

function writeCookie(role: Role | null): void {
  if (typeof document === "undefined") return;
  document.cookie =
    role === null
      ? `${ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
      : `${ROLE_COOKIE}=${role}; path=/; SameSite=Lax`;
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
  writeCookie(role);
}

export function clear(): void {
  write(TOKEN_KEY, null);
  write(ROLE_KEY, null);
  writeCookie(null);
}

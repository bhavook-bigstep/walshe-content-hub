// Route -> role map (AC1). UX guard only: the API enforces RBAC authoritatively.
export type Role = "super_admin" | "content_provider" | "tourism_agent";

export const ROLES: readonly Role[] = ["super_admin", "content_provider", "tourism_agent"];

export const ROUTE_ROLES: Readonly<Record<string, Role>> = {
  "/admin": "super_admin",
  "/provider": "content_provider",
  "/agent": "tourism_agent",
};

export const ROLE_HOME: Readonly<Record<Role, string>> = {
  super_admin: "/admin",
  content_provider: "/provider",
  tourism_agent: "/agent",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Role that owns `path` (prefix match on a segment boundary), or null for public routes. */
export function requiredRole(path: string): Role | null {
  for (const [prefix, role] of Object.entries(ROUTE_ROLES)) {
    if (path === prefix || path.startsWith(prefix + "/")) return role;
  }
  return null;
}

/** True when `role` may view `path`. Unowned (public) paths are open to everyone. */
export function allowed(path: string, role: Role | null): boolean {
  const need = requiredRole(path);
  if (need === null) return true;
  return role === need;
}

/** Middleware decision: redirect target path, or null to let the request through. */
export function redirectFor(path: string, role: Role | null): string | null {
  if (path === "/login") return role ? ROLE_HOME[role] : null;
  if (requiredRole(path) === null) return null;
  if (role === null) return "/login";
  return allowed(path, role) ? null : ROLE_HOME[role];
}

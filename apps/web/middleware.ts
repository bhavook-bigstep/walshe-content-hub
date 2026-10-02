import { NextResponse, type NextRequest } from "next/server";
import { isRole, redirectFor } from "./lib/rbac";

// Route guard (AC1). The role cookie is a UX hint; every API call is authorised server-side.
export function middleware(req: NextRequest) {
  const raw = req.cookies.get("walsh_role")?.value;
  const role = isRole(raw) ? raw : null;
  const target = redirectFor(req.nextUrl.pathname, role);
  if (target === null) return NextResponse.next();
  return NextResponse.redirect(new URL(target, req.url));
}

export const config = {
  matcher: ["/login", "/register", "/admin/:path*", "/provider/:path*", "/agent/:path*"],
};

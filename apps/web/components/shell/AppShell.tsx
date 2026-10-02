"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { me, type User } from "../../lib/api";
import type { Role } from "../../lib/rbac";
import { clear } from "../../lib/session";

interface NavItem {
  href: string;
  label: string;
}

const NAV: Readonly<Record<Role, readonly NavItem[]>> = {
  tourism_agent: [
    { href: "/agent", label: "Overview" },
    { href: "/agent/catalog", label: "Catalog" },
    { href: "/agent/studio", label: "Design Studio" },
    { href: "/agent/projects", label: "Projects" },
    { href: "/agent/collections", label: "Collections" },
    { href: "/agent/templates", label: "Templates" },
    { href: "/agent/brand-kit", label: "Brand kit" },
    { href: "/agent/social", label: "Social" },
    { href: "/agent/engagement", label: "Engagement" },
  ],
  content_provider: [
    { href: "/provider", label: "Overview" },
    { href: "/provider/catalog", label: "My catalog" },
    { href: "/provider/catalog/new", label: "New entry" },
    { href: "/provider/media", label: "Media library" },
    { href: "/provider/performance", label: "Performance" },
    { href: "/provider/team", label: "Team" },
    { href: "/provider/organization", label: "Organization" },
  ],
  super_admin: [{ href: "/admin", label: "Users" }],
};

const ROLE_LABEL: Readonly<Record<Role, string>> = {
  tourism_agent: "Tourism agent",
  content_provider: "Content provider",
  super_admin: "Super admin",
};

const ROLE_BASE: Readonly<Record<Role, string>> = {
  tourism_agent: "/agent",
  content_provider: "/provider",
  super_admin: "/admin",
};

const CRUMB_LABELS: Readonly<Record<string, string>> = {
  catalog: "Catalog",
  studio: "Design Studio",
  social: "Social",
  engagement: "Engagement",
  new: "New entry",
  users: "Users",
  organization: "Organization",
  profile: "Profile",
  media: "Media library",
  team: "Team",
  performance: "Performance",
  projects: "Projects",
  collections: "Collections",
  templates: "Templates",
  "brand-kit": "Brand kit",
};

function isActive(pathname: string, href: string): boolean {
  if (href.endsWith("/new") || href.endsWith("/organization")) return pathname === href;
  if (["/agent", "/provider", "/admin"].includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function crumbsFor(pathname: string): { label: string; href: string }[] {
  const segs = pathname.split("/").filter(Boolean);
  return segs.map((seg, i) => {
    const href = "/" + segs.slice(0, i + 1).join("/");
    const label =
      i === 0
        ? "Home"
        : /^\d+$/.test(seg)
          ? "Details"
          : (CRUMB_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1));
    return { label, href };
  });
}

function initialsOf(name: string | null | undefined, email: string): string {
  const base = (name || "").trim();
  if (base) {
    const parts = base.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return email.charAt(0).toUpperCase();
}

function Logo({ className = "logo-mark h-10 w-[71px]", onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="group inline-flex items-center" aria-label="The Walshe Group — home">
      <span
        role="img"
        aria-label="The Walshe Group"
        className={`${className} bg-white transition-colors duration-300 group-hover:bg-walshe-gold`}
      />
    </Link>
  );
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = crumbsFor(pathname);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 overflow-hidden">
      <ol className="flex flex-nowrap items-center gap-1.5 text-small">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-1.5 whitespace-nowrap">
              {last ? (
                <span aria-current="page" className="truncate font-medium text-walshe-ink">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="text-walshe-grey transition-colors hover:text-walshe-ink">
                  {c.label}
                </Link>
              )}
              {!last && (
                <span aria-hidden className="text-walshe-grey/50">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SidebarInner({
  items,
  pathname,
  role,
  displayName,
  avatarColor,
  initials,
  onNavigate,
  signOut,
}: {
  items: readonly NavItem[];
  pathname: string;
  role: Role;
  displayName: string;
  avatarColor: string;
  initials: string;
  onNavigate?: () => void;
  signOut: () => void;
}) {
  return (
    <>
      <div className="flex h-16 flex-none items-center border-b border-white/10 px-5">
        <Logo onClick={onNavigate} />
      </div>
      <nav aria-label="Primary" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center rounded-md px-3.5 py-2.5 text-[14.5px] font-medium transition-colors ${
                active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <span aria-hidden className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-walshe-mint" />
              )}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Profile section */}
      <div className="flex-none border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-3 px-2 py-1.5">
          <span
            aria-hidden
            className="grid h-9 w-9 flex-none place-items-center rounded-full text-[13px] font-bold text-white"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-small font-semibold text-white">{displayName}</span>
            <span className="block text-[11px] text-white/45">{ROLE_LABEL[role]}</span>
          </span>
        </div>
        <Link
          href={`${ROLE_BASE[role]}/profile`}
          onClick={onNavigate}
          className="block rounded-md px-3 py-2 text-[13.5px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          Profile &amp; settings
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="block w-full rounded-md px-3 py-2 text-left text-[13.5px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </>
  );
}

export default function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false); // mobile drawer
  const [profile, setProfile] = useState<User | null>(null);
  const items = NAV[role];

  useEffect(() => {
    let alive = true;
    me()
      .then((u) => alive && setProfile(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function signOut() {
    clear();
    // Hard navigation so all in-memory session state is dropped and the role cookie clear is applied.
    window.location.assign("/login");
  }

  const displayName = profile?.display_name || profile?.email || "";
  const avatarColor = profile?.avatar_color || "#005653";
  const initials = profile ? initialsOf(profile.display_name, profile.email) : "";

  return (
    <div className="flex h-screen overflow-hidden bg-walshe-mist">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-none flex-col border-r border-white/10 bg-walshe-deep lg:flex">
        <SidebarInner
          items={items}
          pathname={pathname}
          role={role}
          displayName={displayName}
          avatarColor={avatarColor}
          initials={initials}
          signOut={signOut}
        />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — breadcrumbs + profile menu (liquid glass) */}
        <header className="relative z-30 flex h-16 flex-none items-center gap-3 border-b border-white/10 bg-walshe-deep/70 px-5 backdrop-blur-md backdrop-saturate-[1.6] sm:px-7">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="app-drawer"
            className="-ml-1 flex items-center rounded-md p-1.5 text-white/80 hover:bg-white/10 lg:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="lg:hidden">
            <Logo className="logo-mark h-7 w-[50px]" />
          </span>
          <Breadcrumbs pathname={pathname} />
        </header>

        {/* Content region — bounded scroll (AC26: the document never scrolls) */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div key={pathname} className="page-enter mx-auto h-full max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden">
          <div onClick={() => setOpen(false)} aria-hidden className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
          <aside
            id="app-drawer"
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-walshe-deep"
          >
            <SidebarInner
              items={items}
              pathname={pathname}
              role={role}
              displayName={displayName}
              avatarColor={avatarColor}
              initials={initials}
              onNavigate={() => setOpen(false)}
              signOut={signOut}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

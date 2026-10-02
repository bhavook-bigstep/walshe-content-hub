"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
    { href: "/agent/social", label: "Social" },
    { href: "/agent/engagement", label: "Engagement" },
  ],
  content_provider: [
    { href: "/provider", label: "Overview" },
    { href: "/provider/catalog", label: "My catalog" },
    { href: "/provider/catalog/new", label: "New entry" },
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
  onNavigate,
  signOut,
}: {
  items: readonly NavItem[];
  pathname: string;
  role: Role;
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
      <div className="flex-none border-t border-white/10 px-4 py-4">
        <p className="mb-3 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{ROLE_LABEL[role]}</p>
        <button
          type="button"
          onClick={signOut}
          className="w-full rounded-md border border-white/20 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
        >
          Sign out
        </button>
      </div>
    </>
  );
}

export default function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false); // mobile drawer
  const [menuOpen, setMenuOpen] = useState(false); // profile menu
  const [profile, setProfile] = useState<User | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  function signOut() {
    clear();
    router.replace("/login");
  }

  const displayName = profile?.display_name || profile?.email || "";
  const avatarColor = profile?.avatar_color || "#005653";
  const initials = profile ? initialsOf(profile.display_name, profile.email) : "";

  return (
    <div className="flex h-screen overflow-hidden bg-walshe-mist">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-none flex-col border-r border-white/10 bg-walshe-deep lg:flex">
        <SidebarInner items={items} pathname={pathname} role={role} signOut={signOut} />
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

          {/* Profile menu */}
          <div ref={menuRef} className="relative ml-auto flex-none">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2.5 rounded-pill border border-white/10 py-1 pl-1 pr-3 transition-colors hover:bg-white/10"
            >
              <span
                aria-hidden
                className="grid h-8 w-8 flex-none place-items-center rounded-full text-[12px] font-bold text-white"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </span>
              <span className="hidden max-w-[12ch] truncate text-small font-medium text-white sm:block">
                {displayName}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="hidden text-white/60 sm:block" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-md border border-white/10 bg-walshe-deep shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]"
              >
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="truncate text-small font-semibold text-walshe-ink">{displayName}</p>
                  <p className="truncate text-[12px] text-walshe-grey">{ROLE_LABEL[role]}</p>
                </div>
                <Link
                  href={`${ROLE_BASE[role]}/profile`}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-small font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Profile &amp; settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                  className="block w-full px-4 py-2.5 text-left text-small font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
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
            <SidebarInner items={items} pathname={pathname} role={role} onNavigate={() => setOpen(false)} signOut={signOut} />
          </aside>
        </div>
      )}
    </div>
  );
}

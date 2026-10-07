"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { me, type User } from "../../lib/api";
import type { Role } from "../../lib/rbac";
import { clear, hasValidSession, msUntilExpiry } from "../../lib/session";
import ThemeToggle from "../ui/ThemeToggle";
import AssistantWidget from "./AssistantWidget";
import NotificationBell from "./NotificationBell";

interface NavItem {
  href: string;
  label: string;
  icon: string; // SVG path(s) for a 24x24 stroked icon (shown in the collapsed rail)
}

// A small, consistent stroked icon set (24x24) keyed to each nav destination.
const I = {
  home: "M3 11l9-7 9 7M5 10v10h14V10",
  catalog: "M4 5h16v6H4zM4 15h16v4H4z",
  studio: "M3 3h18v18H3zM3 9h18M9 21V9",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  collections: "M4 7h16M4 12h16M4 17h10",
  template: "M4 4h16v4H4zM4 12h7v8H4zM15 12h5v8h-5z",
  brush: "M4 20c3 0 4-2 4-4M14 4l6 6-9 9-4 1 1-4z",
  share: "M6 12a3 3 0 100-2 3 3 0 000 2zM18 6a3 3 0 100-.1zM18 18a3 3 0 100-.1zM8.5 10.5l7-3.5M8.5 13.5l7 3.5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  plus: "M12 5v14M5 12h14",
  image: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  users: "M16 21a4 4 0 00-8 0M12 11a4 4 0 100-8 4 4 0 000 8M20 21a3 3 0 00-4-3",
  building: "M4 21V5a2 2 0 012-2h7a2 2 0 012 2v16M9 8h3M9 12h3M9 16h3M15 21h5V9h-5",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  calendar: "M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
} as const;

const NAV: Readonly<Record<Role, readonly NavItem[]>> = {
  tourism_agent: [
    { href: "/agent", label: "Overview", icon: I.home },
    { href: "/agent/catalog", label: "Catalog", icon: I.catalog },
    { href: "/agent/collections", label: "Collections", icon: I.collections },
    { href: "/agent/templates", label: "Templates", icon: I.template },
    { href: "/agent/studio", label: "Design Studio", icon: I.studio },
    { href: "/agent/projects", label: "Projects", icon: I.folder },
    { href: "/agent/brand-kit", label: "Brand kit", icon: I.brush },
    { href: "/agent/social", label: "Social", icon: I.share },
    { href: "/agent/campaigns", label: "Campaigns", icon: I.calendar },
    { href: "/agent/engagement", label: "Engagement", icon: I.chart },
  ],
  content_provider: [
    { href: "/provider", label: "Overview", icon: I.home },
    { href: "/provider/catalog", label: "Catalog", icon: I.catalog },
    { href: "/provider/performance", label: "Performance", icon: I.chart },
    { href: "/provider/organization", label: "Organization", icon: I.building },
  ],
  super_admin: [
    { href: "/admin", label: "Users", icon: I.users },
    { href: "/admin/audit", label: "Audit log", icon: I.list },
    { href: "/admin/traces", label: "Traces", icon: I.chart },
  ],
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
  campaigns: "Campaigns",
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
  blocklist: "Off-limits",
  audit: "Audit log",
  assistant: "Assistant",
  suggestions: "Suggestions",
  traces: "Traces",
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

function Logo({ className = "h-9", onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="group inline-flex items-center" aria-label="Voyago — home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/voyago-wordmark-white.png"
        alt="Voyago"
        className={`${className} w-auto shrink-0 transition-transform duration-300 group-hover:-translate-y-px`}
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
  collapsed = false,
}: {
  items: readonly NavItem[];
  pathname: string;
  role: Role;
  displayName: string;
  avatarColor: string;
  initials: string;
  onNavigate?: () => void;
  signOut: () => void;
  collapsed?: boolean;
}) {
  return (
    <>
      <div className={`flex h-16 flex-none items-center border-b border-chrome-fg/10 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        {collapsed ? (
          <Link
            href="/"
            onClick={onNavigate}
            aria-label="Voyago — home"
            className="grid h-9 w-9 place-items-center overflow-hidden rounded-md transition-transform hover:scale-105"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/voyago-icon.png" alt="Voyago" className="h-7 w-7 object-contain" />
          </Link>
        ) : (
          <Logo className="h-12" onClick={onNavigate} />
        )}
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
              title={collapsed ? item.label : undefined}
              className={`relative flex items-center gap-3 rounded-md py-2.5 text-[14.5px] font-medium transition-colors ${
                collapsed ? "justify-center px-0" : "px-3.5"
              } ${
                active ? "bg-chrome-fg/10 text-chrome-fg" : "text-chrome-fg/65 hover:bg-chrome-fg/5 hover:text-chrome-fg"
              }`}
            >
              {active && (
                <span aria-hidden className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-walshe-mint" />
              )}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="flex-none" aria-hidden>
                <path d={item.icon} />
              </svg>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Profile section — click to slide a menu up with the profile + sign-out options. */}
      <ProfileSection
        role={role}
        displayName={displayName}
        avatarColor={avatarColor}
        initials={initials}
        onNavigate={onNavigate}
        signOut={signOut}
        collapsed={collapsed}
      />
    </>
  );
}

// Menu icons for the profile menu (shown alone when the sidebar is collapsed).
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ProfileSection({
  role,
  displayName,
  avatarColor,
  initials,
  onNavigate,
  signOut,
  collapsed = false,
}: {
  role: Role;
  displayName: string;
  avatarColor: string;
  initials: string;
  onNavigate?: () => void;
  signOut: () => void;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none border-t border-chrome-fg/10 p-3">
      {open && (
        <div
          role="menu"
          className="menu-slide-up absolute inset-x-3 bottom-full z-50 mb-2 overflow-hidden rounded-md border border-chrome-fg/10 bg-chrome-bg shadow-[0_-18px_40px_-18px_rgba(0,0,0,0.7)]"
        >
          <Link
            href={`${ROLE_BASE[role]}/profile`}
            role="menuitem"
            aria-label="Profile & settings"
            title={collapsed ? "Profile & settings" : undefined}
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className={`flex items-center gap-3 text-small font-medium text-chrome-fg/80 transition-colors hover:bg-chrome-fg/10 hover:text-chrome-fg ${
              collapsed ? "justify-center px-0 py-3" : "px-4 py-2.5"
            }`}
          >
            <SettingsIcon />
            {!collapsed && <span>Profile &amp; settings</span>}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            aria-label="Sign out"
            title={collapsed ? "Sign out" : undefined}
            className={`flex w-full items-center gap-3 text-left text-small font-medium text-chrome-fg/80 transition-colors hover:bg-chrome-fg/10 hover:text-chrome-fg ${
              collapsed ? "justify-center px-0 py-3" : "px-4 py-2.5"
            }`}
          >
            <LogoutIcon />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? displayName : undefined}
        className={`flex w-full items-center gap-3 rounded-md py-1.5 transition-colors hover:bg-chrome-fg/5 ${collapsed ? "justify-center px-0" : "px-2"}`}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 flex-none place-items-center rounded-full text-[13px] font-bold text-chrome-fg"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-small font-semibold text-chrome-fg">{displayName}</span>
              <span className="block text-[11px] text-chrome-fg/45">{ROLE_LABEL[role]}</span>
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className={`flex-none text-chrome-fg/50 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path d="M6 15l6-6 6 6" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}

export default function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const fullBleed = pathname.endsWith("/studio"); // the Design Studio fills the content region
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(true); // desktop sidebar: collapsed to an icon rail by default
  const [profile, setProfile] = useState<User | null>(null);
  const items = NAV[role];

  // Remember the collapsed choice per device; default to collapsed when nothing is stored yet.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("walsh-sidebar-collapsed");
      if (stored !== null) setCollapsed(stored === "1");
    } catch {
      /* storage blocked */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("walsh-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }

  function signOut() {
    clear();
    // Hard navigation so all in-memory session state is dropped and the role cookie clear is applied.
    window.location.assign("/login");
  }

  // Session guard: never render workspace content on an expired/absent token. Runs on mount and on
  // every client navigation, and schedules a logout for the moment the token expires while open —
  // so the user is sent to /login *before* an API call can fail with "invalid token".
  useEffect(() => {
    if (!hasValidSession()) {
      signOut();
      return;
    }
    const ms = msUntilExpiry();
    if (ms === null) return;
    const timer = window.setTimeout(signOut, ms);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    let alive = true;
    me()
      .then((u) => alive && setProfile(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const displayName = profile?.display_name || profile?.email || "";
  const avatarColor = profile?.avatar_color || "#005653";
  const initials = profile ? initialsOf(profile.display_name, profile.email) : "";

  return (
    <div className="flex h-screen overflow-hidden bg-walshe-mist">
      {/* Desktop sidebar — collapsible to an icon rail */}
      <aside
        className={`hidden flex-none flex-col border-r border-chrome-fg/10 bg-chrome-bg transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        <SidebarInner
          items={items}
          pathname={pathname}
          role={role}
          displayName={displayName}
          avatarColor={avatarColor}
          initials={initials}
          signOut={signOut}
          collapsed={collapsed}
        />
      </aside>

      {/* Main column */}
      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        {/* Provider workspace watermark: a top-down plane anchored to the right, only its left half
            visible, very light. Behind the content (-z-10 within this isolated column); provider only. */}
        {role === "content_provider" && (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/img/plane.png"
              alt=""
              className="absolute right-0 top-24 h-[125%] w-auto max-w-none translate-x-1/2 opacity-[0.2]"
            />
          </div>
        )}
        {/* Sidebar collapse toggle — a subtle round button on the sidebar's right edge (desktop). */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute left-0 top-8 z-40 hidden h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-chrome-fg/15 bg-chrome-bg text-chrome-fg/70 shadow-md transition-colors hover:bg-chrome-fg/10 hover:text-chrome-fg lg:grid"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${collapsed ? "rotate-180" : ""}`} aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        {/* Top bar — breadcrumbs + profile menu (liquid glass) */}
        <header className="relative z-30 flex h-16 flex-none items-center gap-3 border-b border-chrome-fg/10 bg-chrome-bg/70 px-5 backdrop-blur-md backdrop-saturate-[1.6] sm:px-7">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="app-drawer"
            className="-ml-1 flex items-center rounded-md p-1.5 text-chrome-fg/80 hover:bg-chrome-fg/10 lg:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="lg:hidden">
            <Logo className="h-7" />
          </span>
          <Breadcrumbs pathname={pathname} />
          {/* Right-side top-bar controls: the provider's import-job bell (AC74) + light/dark toggle. */}
          <div className="ml-auto flex flex-none items-center gap-1">
            {role === "content_provider" && <NotificationBell />}
            <ThemeToggle
              compact
              className="grid h-9 w-9 flex-none place-items-center rounded-md text-chrome-fg/70 transition-colors hover:bg-chrome-fg/10 hover:text-chrome-fg"
            />
          </div>
        </header>

        {/* Content region — bounded scroll (AC26: the document never scrolls). The Design Studio
            renders full-bleed (edge-to-edge canvas, floating panels) with no inner padding/max-width. */}
        <main className={`min-h-0 flex-1 ${fullBleed ? "overflow-hidden" : "overflow-y-auto"}`}>
          {fullBleed ? (
            <div key={pathname} className="page-enter h-full w-full">
              {children}
            </div>
          ) : (
            <div key={pathname} className="page-enter mx-auto h-full max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">
              {children}
            </div>
          )}
        </main>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden">
          <div onClick={() => setOpen(false)} aria-hidden className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
          <aside
            id="app-drawer"
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-chrome-fg/10 bg-chrome-bg"
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

      {/* Sticky Q/A assistant — agents only (content generation lives in the Design Studio). */}
      {(role === "tourism_agent" || role === "content_provider") && <AssistantWidget role={role} />}
    </div>
  );
}

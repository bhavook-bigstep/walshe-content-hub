"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Role } from "../../lib/rbac";
import { clear } from "../../lib/session";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const I = {
  home: <path d="M3 12l9-8 9 8M5 10v10h14V10" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  studio: <path d="M12 3v18M3 12h18M7 7l10 10M17 7L7 17" />,
  social: <path d="M4 5h16v11H4zM8 20h8M12 16v4" />,
  chart: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />,
  users: <path d="M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M21 20v-1a4 4 0 00-3-3.9" />,
  add: <path d="M12 5v14M5 12h14" />,
} as const;

function Icon({ d }: { d: ReactNode }) {
  return (
    <svg className="h-[18px] w-[18px] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

const NAV: Readonly<Record<Role, readonly NavItem[]>> = {
  tourism_agent: [
    { href: "/agent", label: "Overview", icon: <Icon d={I.home} /> },
    { href: "/agent/catalog", label: "Catalog", icon: <Icon d={I.grid} /> },
    { href: "/agent/studio", label: "Design Studio", icon: <Icon d={I.studio} /> },
    { href: "/agent/social", label: "Social", icon: <Icon d={I.social} /> },
    { href: "/agent/engagement", label: "Engagement", icon: <Icon d={I.chart} /> },
  ],
  content_provider: [
    { href: "/provider", label: "Overview", icon: <Icon d={I.home} /> },
    { href: "/provider/catalog", label: "My catalog", icon: <Icon d={I.grid} /> },
    { href: "/provider/catalog/new", label: "New entry", icon: <Icon d={I.add} /> },
  ],
  super_admin: [{ href: "/admin", label: "Users", icon: <Icon d={I.users} /> }],
};

const ROLE_LABEL: Readonly<Record<Role, string>> = {
  tourism_agent: "Tourism agent",
  content_provider: "Content provider",
  super_admin: "Super admin",
};

function isActive(pathname: string, href: string): boolean {
  if (href.endsWith("/new")) return pathname === href;
  if (["/agent", "/provider", "/admin"].includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-walshe-amber text-[17px] font-extrabold text-walshe-ink">W</span>
      <span className="text-[17px] font-extrabold tracking-tight text-white">Walshe</span>
    </span>
  );
}

export default function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = NAV[role];
  const home = role === "super_admin" ? "/admin" : role === "content_provider" ? "/provider" : "/agent";

  function signOut() {
    clear();
    router.replace("/login");
  }

  const links = (
    <nav aria-label="Primary" className="flex flex-col gap-1.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3.5 py-2.5 text-[14.5px] font-semibold transition-colors ${
              active ? "bg-walshe-amber text-walshe-ink" : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-walshe-mist lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col justify-between bg-walshe-teal px-4 py-6 lg:flex">
        <div className="flex flex-col gap-9">
          <Link href={home} className="px-1.5"><Wordmark /></Link>
          {links}
        </div>
        <div className="border-t border-white/10 pt-4">
          <p className="px-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">{ROLE_LABEL[role]}</p>
          <button type="button" onClick={signOut} className="mt-2 w-full rounded-md px-3.5 py-2.5 text-left text-[14.5px] font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white">
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-walshe-teal px-4 py-3 lg:hidden">
        <Link href={home}><Wordmark /></Link>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav" className="rounded-md p-2 text-white hover:bg-white/10">
          <span className="sr-only">Toggle navigation</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </header>
      {open && (
        <div id="mobile-nav" className="bg-walshe-teal px-4 pb-4 lg:hidden">
          {links}
          <button type="button" onClick={signOut} className="mt-2 w-full rounded-md px-3.5 py-2.5 text-left text-[14.5px] font-semibold text-white/75 hover:bg-white/10 hover:text-white">
            Sign out
          </button>
        </div>
      )}

      {/* Content */}
      <main className="min-w-0 flex-1 px-5 py-7 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}

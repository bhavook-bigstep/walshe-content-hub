"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
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
  ],
  super_admin: [{ href: "/admin", label: "Users" }],
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
      <span className="grid h-9 w-9 place-items-center rounded-sm bg-walshe-teal text-[17px] font-bold text-white">W</span>
      <span className="text-[18px] font-semibold tracking-tight text-white">Walshe</span>
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

  return (
    <div className="min-h-screen bg-walshe-mist">
      {/* Sticky framed top nav (matches the landing) */}
      <header className="load-stagger sticky top-0 z-40 flex h-[72px] items-stretch border-b border-white/10 bg-walshe-ink text-white">
        <Link href={home} className="flex items-center border-r border-white/10 px-6">
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-stretch px-2 lg:flex">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center px-4 text-[14.5px] font-medium transition-colors ${
                  active ? "text-walshe-teal" : "text-white/75 hover:text-white"
                }`}
              >
                {item.label}
                {active && <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 bg-walshe-teal" />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-4 border-l border-white/10 px-6 lg:flex">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">{ROLE_LABEL[role]}</span>
          <button type="button" onClick={signOut} className="rounded-pill bg-white/10 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/20">
            Sign out
          </button>
        </div>

        {/* Mobile toggle */}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="app-mobile-nav" className="ml-auto flex items-center px-6 lg:hidden">
          <span className="sr-only">Toggle navigation</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </header>

      {/* Mobile menu */}
      {open && (
        <div id="app-mobile-nav" className="border-b border-white/10 bg-walshe-ink px-4 py-3 text-white lg:hidden">
          <nav className="flex flex-col">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded-sm px-3 py-2.5 text-[15px] font-medium ${isActive(pathname, item.href) ? "text-walshe-teal" : "text-white/80 hover:bg-white/10"}`}
              >
                {item.label}
              </Link>
            ))}
            <button type="button" onClick={signOut} className="mt-1 rounded-sm px-3 py-2.5 text-left text-[15px] font-medium text-white/80 hover:bg-white/10">
              Sign out
            </button>
          </nav>
        </div>
      )}

      {/* Content */}
      <main className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}

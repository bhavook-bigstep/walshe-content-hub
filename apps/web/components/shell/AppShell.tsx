"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Role } from "../../lib/rbac";
import { clear } from "../../lib/session";
import WalsheLogo from "../brand/WalsheLogo";

interface NavItem {
  href: string;
  label: string;
}

// Role-aware navigation (AC21). The API enforces RBAC authoritatively; this is the branded shell.
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
  // Overview links (role root) match only exactly; section links match their subtree.
  const roots = ["/agent", "/provider", "/admin"];
  if (roots.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = NAV[role];

  function signOut() {
    clear();
    router.replace("/login");
  }

  const navList = (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-sm px-3 py-2 text-small font-medium transition-colors ${
              active
                ? "bg-walshe-mint text-walshe-teal"
                : "text-walshe-mint/80 hover:bg-walshe-teal-700 hover:text-walshe-white"
            }`}
          >
            {active && (
              <span aria-hidden className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-pill bg-walshe-teal" />
            )}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop left rail */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between bg-walshe-teal px-4 py-6 lg:flex">
        <div className="flex flex-col gap-8">
          <Link href={`/${role === "super_admin" ? "admin" : role === "content_provider" ? "provider" : "agent"}`}>
            <WalsheLogo tone="teal" />
          </Link>
          {navList}
        </div>
        <div className="border-t border-walshe-teal-700 pt-4">
          <p className="px-3 text-[11px] uppercase tracking-wide text-walshe-mint/70">{ROLE_LABEL[role]}</p>
          <button type="button" onClick={signOut} className="mt-2 w-full rounded-sm px-3 py-2 text-left text-small font-medium text-walshe-mint/80 transition-colors hover:bg-walshe-teal-700 hover:text-walshe-white">
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-walshe-teal px-4 py-3 lg:hidden">
        <Link href={`/${role === "super_admin" ? "admin" : role === "content_provider" ? "provider" : "agent"}`}>
          <WalsheLogo tone="teal" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="rounded-sm p-2 text-walshe-mint hover:bg-walshe-teal-700"
        >
          <span className="sr-only">Toggle navigation</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </header>
      {open && (
        <div id="mobile-nav" className="bg-walshe-teal px-4 pb-4 lg:hidden">
          {navList}
          <button type="button" onClick={signOut} className="mt-3 w-full rounded-sm border border-walshe-teal-700 px-3 py-2 text-left text-small font-medium text-walshe-mint">
            Sign out
          </button>
        </div>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-content px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}

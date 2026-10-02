"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { me } from "../../lib/api";
import { ROLE_HOME } from "../../lib/rbac";
import { getToken } from "../../lib/session";

// Landing nav: a framed bar — logo bay · section links · Sign in bay — whose hairline borders DRAW
// themselves in on load, with the bar's contents dropping in (load-stagger). Transparent over the
// hero; on scroll it becomes a deep-teal "liquid glass" bar. White text; the logo turns gold on hover.
const NAV_LINKS = [
  { label: "For the trade", href: "#the-hub" },
  { label: "Destinations", href: "#catalog" },
  { label: "How it works", href: "#how-it-works" },
];

export default function SiteNav() {
  const [solid, setSolid] = useState(false);
  const [account, setAccount] = useState<{ name: string; home: string } | null>(null);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // If already signed in, the Sign-in bay shows the person's alias and links to their workspace.
  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    me()
      .then((u) => alive && setAccount({ name: u.display_name || u.email, home: ROLE_HOME[u.role] }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <header
      className={`load-stagger fixed inset-x-0 top-0 z-50 flex h-[76px] items-stretch text-[15px] text-white transition-all duration-500 ${
        solid
          ? "bg-walshe-deep/30 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.5)] backdrop-blur-md backdrop-saturate-[1.8]"
          : "bg-transparent"
      }`}
    >
      <span aria-hidden className="draw-x absolute bottom-0 left-0 h-px w-full bg-white/25" />

      <Link href="/" className="group relative flex items-center px-7" aria-label="The Walshe Group — home">
        <span role="img" aria-label="The Walshe Group" className="logo-mark h-11 w-[78px] bg-white transition-colors duration-300 group-hover:bg-walshe-gold" />
        <span aria-hidden className="draw-y absolute right-0 top-0 h-full w-px bg-white/25" />
      </Link>

      <div className="hidden flex-1 items-center justify-end gap-9 px-8 lg:flex">
        {NAV_LINKS.map((l) => (
          <a key={l.label} href={l.href} className="font-medium text-white/85 transition-colors hover:text-white">
            {l.label}
          </a>
        ))}
      </div>

      {account ? (
        <Link
          href={account.home}
          className="relative ml-auto flex items-center gap-2.5 px-7 font-semibold transition-colors hover:bg-white/10 lg:ml-0"
        >
          <span aria-hidden className="draw-y absolute left-0 top-0 h-full w-px bg-white/25" />
          <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full bg-white text-[12px] font-bold text-walshe-teal">
            {account.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="max-w-[16ch] truncate">{account.name}</span>
        </Link>
      ) : (
        <Link href="/login" className="relative ml-auto flex items-center px-7 font-semibold transition-colors hover:bg-white/10 lg:ml-0">
          <span aria-hidden className="draw-y absolute left-0 top-0 h-full w-px bg-white/25" />
          Sign in
        </Link>
      )}
    </header>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Landing nav (reference-style): a framed bar — logo bay · links · Sign in bay · Explore bay with
// hairline dividers — that is transparent over the hero and turns into a solid dark bar on scroll.
export default function SiteNav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`load-stagger fixed inset-x-0 top-0 z-50 flex h-[76px] items-stretch border-b text-[15px] text-white transition-colors duration-300 ${
        solid ? "border-white/10 bg-walshe-ink/95 backdrop-blur-sm" : "border-white/15 bg-transparent"
      }`}
    >
      <Link href="/" className="flex items-center border-r border-white/15 px-7">
        <span className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-sm bg-walshe-amber text-[17px] font-bold text-walshe-ink">W</span>
          <span className="text-[19px] font-semibold tracking-tight text-white">Walshe</span>
        </span>
      </Link>
      <div className="hidden flex-1 items-center justify-end gap-9 px-8 lg:flex">
        {["For the trade", "Destinations", "How it works"].map((l) => (
          <span key={l} className="cursor-default font-medium text-white/85 transition-colors hover:text-white">{l}</span>
        ))}
      </div>
      <Link href="/login" className="ml-auto flex items-center border-l border-white/15 px-7 font-semibold text-white lg:ml-0">
        Sign in
      </Link>
      <Link href="/login" className="hidden items-center border-l border-white/15 px-7 font-semibold text-white transition-colors hover:bg-white/10 lg:flex">
        Explore
      </Link>
    </header>
  );
}

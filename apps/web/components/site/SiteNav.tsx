"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Landing nav: a framed bar — logo bay · links · Sign in bay · Explore bay — whose hairline borders
// DRAW themselves in on load. Transparent over the hero; on scroll it becomes a deep-teal "liquid
// glass" bar (translucent + heavy backdrop blur). White text throughout.
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
      className={`load-stagger fixed inset-x-0 top-0 z-50 flex h-[76px] items-stretch text-[15px] text-white transition-all duration-500 ${
        solid
          ? "bg-walshe-deep/55 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] backdrop-blur-2xl backdrop-saturate-150"
          : "bg-transparent"
      }`}
    >
      <span aria-hidden className="draw-x absolute bottom-0 left-0 h-px w-full bg-white/25" />

      <Link href="/" className="relative flex items-center px-7">
        <span className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-sm bg-white text-[17px] font-bold text-walshe-teal">W</span>
          <span className="text-[19px] font-semibold tracking-tight">Walshe</span>
        </span>
        <span aria-hidden className="draw-y absolute right-0 top-0 h-full w-px bg-white/25" />
      </Link>

      <div className="hidden flex-1 items-center justify-end gap-9 px-8 lg:flex">
        {["For the trade", "Destinations", "How it works"].map((l) => (
          <span key={l} className="cursor-default font-medium text-white/85 transition-colors hover:text-white">{l}</span>
        ))}
      </div>

      <Link href="/login" className="relative ml-auto flex items-center px-7 font-semibold lg:ml-0">
        <span aria-hidden className="draw-y absolute left-0 top-0 h-full w-px bg-white/25" />
        Sign in
      </Link>
      <Link href="/login" className="relative hidden items-center px-7 font-semibold transition-colors hover:bg-white/10 lg:flex">
        <span aria-hidden className="draw-y absolute left-0 top-0 h-full w-px bg-white/25" />
        Explore
      </Link>
    </header>
  );
}

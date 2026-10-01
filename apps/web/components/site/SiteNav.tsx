"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Landing nav: a framed bar — logo bay · links · Sign in bay · Explore bay — whose hairline borders
// DRAW themselves in on load. Transparent (white text) over the hero; a solid WHITE bar (ink text)
// once you scroll, so it matches the light app.
export default function SiteNav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const line = solid ? "bg-walshe-line" : "bg-white/30";
  const text = solid ? "text-walshe-ink" : "text-white";
  const linkMuted = solid ? "text-walshe-ink/65 hover:text-walshe-ink" : "text-white/85 hover:text-white";

  return (
    <header
      className={`load-stagger fixed inset-x-0 top-0 z-50 flex h-[76px] items-stretch text-[15px] transition-colors duration-300 ${
        solid ? "bg-white/95 backdrop-blur-sm" : "bg-transparent"
      } ${text}`}
    >
      {/* bottom hairline draws in */}
      <span aria-hidden className={`draw-x absolute bottom-0 left-0 h-px w-full ${line}`} />

      <Link href="/" className="relative flex items-center px-7">
        <span className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-sm bg-walshe-teal text-[17px] font-bold text-white">W</span>
          <span className="text-[19px] font-semibold tracking-tight">Walshe</span>
        </span>
        <span aria-hidden className={`draw-y absolute right-0 top-0 h-full w-px ${line}`} />
      </Link>

      <div className="hidden flex-1 items-center justify-end gap-9 px-8 lg:flex">
        {["For the trade", "Destinations", "How it works"].map((l) => (
          <span key={l} className={`cursor-default font-medium transition-colors ${linkMuted}`}>{l}</span>
        ))}
      </div>

      <Link href="/login" className="relative ml-auto flex items-center px-7 font-semibold lg:ml-0">
        <span aria-hidden className={`draw-y absolute left-0 top-0 h-full w-px ${line}`} />
        Sign in
      </Link>
      <Link href="/login" className="relative hidden items-center px-7 font-semibold lg:flex">
        <span aria-hidden className={`draw-y absolute left-0 top-0 h-full w-px ${line}`} />
        Explore
      </Link>
    </header>
  );
}

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

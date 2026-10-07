"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import Reveal from "../ui/Reveal";

// The hero, pinned, with a scroll-scrubbed plane wipe INTO the first section. The hero itself is the
// backdrop (no duplicate): as you scroll, the plane flies up over the real hero content and a white
// sheet — its top edge riding the plane's wing line — rises behind the wings, wiping the hero away
// and clearing into the first section. Driven by the page's own scroll (works with Lenis). For
// reduced-motion the section collapses to a static hero (see .hero-flight in globals.css).
const WING = 0.5; // the plane's wings sit ~halfway down the image; the white sheet starts there

export default function HeroFlight() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const planeRef = useRef<HTMLImageElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const plane = planeRef.current;
    const sheet = sheetRef.current;
    if (!section || !plane || !sheet) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height - vh; // scroll distance while the hero is pinned
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      const planeH = plane.offsetHeight || vh * 1.8;
      // p=0: nose at the viewport bottom (plane just below). p=1: wings at the top (white fills).
      const startY = vh;
      const endY = -WING * planeH;
      const ty = startY + (endY - startY) * p;
      plane.style.transform = `translate3d(-50%, ${ty}px, 0)`;
      sheet.style.transform = `translate3d(0, ${ty + WING * planeH}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={sectionRef} className="hero-flight relative h-[230vh] text-white">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Hero backdrop */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/hero-uluru.jpg" alt="Uluru at sunset, Northern Territory" className="absolute inset-0 z-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(3,22,15,.62)_0%,rgba(3,22,15,.32)_30%,rgba(3,22,15,.44)_66%,rgba(3,22,15,.86)_100%)]" />

        {/* Hero content (centered in the pinned viewport) */}
        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1100px] flex-col items-center justify-center px-7 pb-20 pt-24 text-center">
          <Reveal variant="slidey" dir="down" className="flex flex-col items-center gap-0">
            <h1 className="sr-only">Voyago — verified destination content for the travel trade</h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/voyago-wordmark-white.png" alt="Voyago" className="h-auto w-[min(86vw,640px)] drop-shadow-[0_10px_36px_rgba(0,0,0,0.45)]" />
            <span className="-mt-3 text-eyebrow uppercase text-white/70">A Walshe Group product</span>
          </Reveal>
          <Reveal as="p" variant="color" dir="up" delayMs={260} full="#ffffff" dull="rgba(255,255,255,0.42)" className="mt-8 max-w-[48ch] text-[clamp(17px,2vw,22px)] font-light leading-snug">
            Every Destination, Ready To Go!
          </Reveal>
          <Reveal variant="slidey" dir="up" className="mt-10 flex items-center justify-center" delayMs={520}>
            <Link href="/login" className="group inline-flex items-center gap-3 rounded-pill border border-white/40 py-4 pl-7 pr-5 text-[15px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:border-white hover:bg-white hover:text-walshe-teal">
              Go to App
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-white transition-colors group-hover:bg-walshe-teal group-hover:text-white">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          </Reveal>
        </div>

        {/* White sheet left behind the wings (its top edge rides the wing line). */}
        <div
          ref={sheetRef}
          className="hero-fx absolute inset-x-0 top-0 z-20 h-[300vh] bg-walshe-paper [will-change:transform]"
          style={{ transform: "translate3d(0, 130vh, 0)" }}
        />
        {/* The plane, on top, flying up over the real hero. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={planeRef}
          src="/img/plane.png"
          alt=""
          aria-hidden
          className="hero-fx pointer-events-none absolute left-1/2 top-0 z-30 w-[120vw] max-w-none [will-change:transform] drop-shadow-[0_40px_80px_rgba(0,0,0,0.3)]"
          style={{ transform: "translate3d(-50%, 130vh, 0)" }}
        />
      </div>
    </section>
  );
}

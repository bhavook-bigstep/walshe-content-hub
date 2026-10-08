"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import Reveal from "../ui/Reveal";

// The hero, pinned, with a scroll-scrubbed plane wipe INTO the first section. The hero itself is the
// backdrop (no duplicate): as you scroll, the plane flies up over the real hero content and a white
// sheet rises behind it, wiping the hero away and clearing into the first section. The sheet's top
// edge is a full-width DOME (semi-ellipse) peaking at the plane's wing line — so it covers the whole
// width on its own and the plane stays its natural size (no 120vw up-scaling). Once a downward scroll
// is triggered on the hero we auto-advance (Lenis scrollTo) so the flight plays through to the next
// section. Reduced-motion collapses to a static hero (see .hero-flight in globals.css).
// Measured from plane.png: the wings span 98.4% of the image width and their line sits 56.6% down
// the image (the lowest, widest point), with the nose at 2.5%. We drive the wipe off those numbers so
// the white meets the wings exactly instead of leaving a strip of hero showing.
const WING = 0.566; // fraction down the image where the wing line sits
const NOSE = 0.025; // fraction down the image where the nose begins
const DOME = 0.2; // dome height as a fraction of the viewport (its vertical radius)

type Lenisish = { scrollTo: (target: unknown, opts?: unknown) => void };

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

    let autoTriggered = false;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height - vh; // scroll distance while the hero is pinned
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      const planeH = plane.offsetHeight || vh * 1.25;
      const H = DOME * vh; // the dome's vertical radius (its top CSS radius matches, below)

      // wingY = where the wing line sits in the viewport. p=0: plane fully below (nose at the fold),
      // nothing white. p=1: wings cleared the top and the dome's edges are past it, so white fills.
      const startWingY = vh + (WING - NOSE) * planeH;
      const endWingY = -0.04 * vh;
      const wingY = startWingY + (endWingY - startWingY) * p;
      // Plane: put image-fraction WING exactly on wingY. Sheet: dome peak H above the wing line so the
      // dome's lower EDGES land on the wing line — no strip of hero shows under the wings.
      plane.style.transform = `translate3d(-50%, ${wingY - WING * planeH}px, 0)`;
      sheet.style.transform = `translate3d(0, ${wingY - H}px, 0)`;
      sheet.style.borderTopLeftRadius = `50% ${H}px`;
      sheet.style.borderTopRightRadius = `50% ${H}px`;

      // Once the viewer commits to scrolling down on the hero, fly the rest of the way on its own so
      // the plane lands the next section square in frame. Resets when they return to the top.
      if (p <= 0.002) {
        autoTriggered = false;
      } else if (!autoTriggered && p > 0.03 && p < 0.9) {
        autoTriggered = true;
        const next = document.getElementById("product");
        const lenis = (window as unknown as { __lenis?: Lenisish }).__lenis;
        // lock:true so the viewer's own (still-active) wheel gesture can't cancel the flight — it
        // plays all the way through to the next section on its own.
        if (next && lenis)
          lenis.scrollTo(next, {
            duration: 3.2,
            lock: true,
            easing: (t: number) => 1 - Math.pow(1 - t, 3),
          });
        else if (next) next.scrollIntoView({ behavior: "smooth" });
      }
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

        {/* White sheet left behind the plane. Its top is a full-width dome (radius set in JS to match
            the wing line), so it clears the whole width without scaling the plane up. */}
        <div
          ref={sheetRef}
          className="hero-fx absolute inset-x-0 top-0 z-20 h-[300vh] bg-walshe-paper [will-change:transform]"
          style={{ transform: "translate3d(0, 100vh, 0)" }}
        />
        {/* The plane, on top, flying up over the real hero — natural size, riding the dome peak. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={planeRef}
          src="/img/plane.png"
          alt=""
          aria-hidden
          className="hero-fx pointer-events-none absolute left-1/2 top-0 z-30 w-[101vw] max-w-none [will-change:transform] drop-shadow-[0_40px_80px_rgba(0,0,0,0.3)]"
          style={{ transform: "translate3d(-50%, 100vh, 0)" }}
        />
      </div>
    </section>
  );
}

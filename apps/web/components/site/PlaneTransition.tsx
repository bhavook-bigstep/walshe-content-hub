"use client";

import { useEffect, useRef } from "react";

// Scroll-scrubbed wipe from the hero into the first section. A pinned stage continues the hero's
// dark field; as you scroll, the plane flies up from below over it and a white sheet — whose top
// edge rides the plane's wing line — rises behind the wings, wiping the dark away and clearing into
// the first section. Driven by the page's own scroll (works with Lenis). Collapsed for reduced-motion
// via CSS (.plane-transition in globals.css).
const WING = 0.5; // the plane's wings sit ~halfway down the image; the white sheet starts here

export default function PlaneTransition() {
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
      const total = rect.height - vh; // scroll distance while the stage is pinned
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      const planeH = plane.offsetHeight || vh * 1.8;
      // p=0: nose at the bottom of the viewport (plane just below). p=1: wings at the top (white fills).
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
    <section ref={sectionRef} aria-hidden className="plane-transition relative h-[230vh]">
      <div className="sticky top-0 h-screen overflow-hidden bg-walshe-base">
        {/* Continue the hero's field so the plane appears over it (not over blank white). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/hero-uluru.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,22,15,.58)_0%,rgba(3,22,15,.78)_100%)]" />
        {/* White sheet left behind the wings (its top edge rides the wing line). */}
        <div
          ref={sheetRef}
          className="absolute inset-x-0 top-0 h-[300vh] bg-walshe-paper [will-change:transform]"
          style={{ transform: "translate3d(0, 130vh, 0)" }}
        />
        {/* The plane, on top, flying up. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={planeRef}
          src="/img/plane.png"
          alt=""
          className="pointer-events-none absolute left-1/2 top-0 w-[120vw] max-w-none [will-change:transform] drop-shadow-[0_40px_80px_rgba(0,0,0,0.3)]"
          style={{ transform: "translate3d(-50%, 130vh, 0)" }}
        />
      </div>
    </section>
  );
}

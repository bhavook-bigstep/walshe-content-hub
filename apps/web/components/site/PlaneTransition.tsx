"use client";

import { useEffect, useRef } from "react";

// Scroll-scrubbed transition between the hero and the first section: a tall section pins a clean
// stage while the plane flies up from below the fold — its wingspan spanning the screen as it sweeps
// across — then exits the top, clearing to the first section. Driven by the page's own scroll
// position (works with the Lenis smooth-scroll, which drives real window scroll). Disabled for
// reduced-motion via CSS (.plane-transition collapses to display:none in globals.css).
export default function PlaneTransition() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const planeRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const plane = planeRef.current;
    if (!section || !plane) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height - vh; // scroll distance while the stage is pinned
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      const planeH = plane.offsetHeight || vh * 1.6;
      // Fly fully from below the fold (nose entering) to above it (tail clearing the top).
      const ty = vh - p * (vh + planeH);
      plane.style.transform = `translate3d(-50%, ${ty}px, 0)`;
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
    <section ref={sectionRef} aria-hidden className="plane-transition relative h-[200vh] bg-walshe-paper">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={planeRef}
          src="/img/plane.png"
          alt=""
          className="pointer-events-none absolute left-1/2 top-0 w-[120vw] max-w-none [will-change:transform] drop-shadow-[0_40px_80px_rgba(0,0,0,0.28)]"
          style={{ transform: "translate3d(-50%, 100vh, 0)" }}
        />
      </div>
    </section>
  );
}

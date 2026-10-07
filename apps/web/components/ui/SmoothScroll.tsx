"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import gsap from "gsap";

// Smooth scrolling (Lenis) driven by the GSAP ticker — the same stack the reference site uses, so
// the smoothed scroll and the GSAP reveals share one clock. Wheel only; touch devices and
// reduced-motion viewers keep fully native scrolling.
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1, smoothWheel: true });
    // Expose it so scroll-driven sections (e.g. the hero plane wipe) can auto-advance via scrollTo.
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    const raf = (time: number) => lenis.raf(time * 1000); // GSAP ticker gives seconds; Lenis wants ms
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, []);

  return null;
}

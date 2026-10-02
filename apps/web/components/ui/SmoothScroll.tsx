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

    const raf = (time: number) => lenis.raf(time * 1000); // GSAP ticker gives seconds; Lenis wants ms
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}

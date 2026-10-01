"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

// Smooth scrolling via Lenis (darkroom.engineering) — the standard library the reference-style
// sites use. It preserves momentum, so this is a gentle, barely-slower glide rather than a drag.
// Wheel only; touch scrolling stays native, and reduced-motion viewers get no smoothing at all.
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.12, // light smoothing — close to native, just a touch softer/slower
      wheelMultiplier: 1,
      smoothWheel: true,
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}

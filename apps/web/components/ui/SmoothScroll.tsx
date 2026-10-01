"use client";

import { useEffect } from "react";

// Very light wheel damping for the landing: scrolls a touch less per wheel tick than native, so
// the page moves just slightly slower — no inertia, no glide, 1:1 responsiveness. Touch devices,
// reduced-motion viewers, line-mode wheels and pinch-zoom all keep fully native scrolling.
export default function SmoothScroll() {
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    const SPEED = 0.9; // just a tad slower than native

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaMode !== 0) return; // leave pinch-zoom and line-mode wheels native
      e.preventDefault();
      window.scrollBy({ top: e.deltaY * SPEED, behavior: "auto" });
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}

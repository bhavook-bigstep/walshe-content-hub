"use client";

import { useEffect } from "react";

// A light, dependency-free smooth-scroll for the editorial landing: it eases wheel input toward a
// target with a sub-1 multiplier, so scrolling feels a touch slower and glides rather than jumps —
// the reference's inertia feel. Native scrolling is left untouched on touch devices and when the
// viewer prefers reduced motion. Programmatic scrolls (scrollTo / keyboard / anchors) pass through.
export default function SmoothScroll() {
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    const EASE = 0.09; // lower = smoother/slower glide
    const SPEED = 0.85; // <1 = a little slower per wheel tick
    let target = window.scrollY;
    let current = window.scrollY;
    let active = false;
    let raf = 0;

    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

    const loop = () => {
      current += (target - current) * EASE;
      if (Math.abs(target - current) < 0.4) {
        current = target;
        window.scrollTo(0, Math.round(current));
        active = false;
        return;
      }
      window.scrollTo(0, Math.round(current));
      raf = requestAnimationFrame(loop);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // leave pinch-zoom alone
      e.preventDefault();
      target = Math.max(0, Math.min(maxScroll(), target + e.deltaY * SPEED));
      if (!active) {
        active = true;
        current = window.scrollY;
        raf = requestAnimationFrame(loop);
      }
    };

    // Keep the target in sync when the user scrolls by other means (keyboard, scrollbar, anchors).
    const onScroll = () => {
      if (!active) target = window.scrollY;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}

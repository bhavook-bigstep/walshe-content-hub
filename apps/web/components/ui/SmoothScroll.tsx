"use client";

import { useEffect } from "react";

// Light inertia smooth-scroll for the landing. It accumulates wheel input into a target and eases
// toward it each frame, so momentum is preserved (the trackpad glide is NOT killed) — the fix for
// the earlier "massively slow" damping, which cancelled native momentum. Tuned brisk and barely
// slower than native: nearly the full wheel distance, with a fast catch-up so there's no drag.
// Touch devices, reduced-motion viewers, line-mode wheels and pinch-zoom keep fully native scroll.
export default function SmoothScroll() {
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    const EASE = 0.2; // high = snappy catch-up, minimal glide (feels close to native)
    const SPEED = 0.92; // just a touch under native distance per tick

    let target = window.scrollY;
    let current = window.scrollY;
    let active = false;
    let raf = 0;

    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

    const loop = () => {
      current += (target - current) * EASE;
      if (Math.abs(target - current) < 0.5) {
        current = target;
        window.scrollTo(0, Math.round(current));
        active = false;
        return;
      }
      window.scrollTo(0, Math.round(current));
      raf = requestAnimationFrame(loop);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaMode !== 0) return; // leave pinch-zoom and line-mode wheels native
      e.preventDefault();
      target = Math.max(0, Math.min(maxScroll(), target + e.deltaY * SPEED));
      if (!active) {
        active = true;
        current = window.scrollY;
        raf = requestAnimationFrame(loop);
      }
    };

    // Keep the target synced when scrolling by other means (keyboard, scrollbar, anchor jumps).
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

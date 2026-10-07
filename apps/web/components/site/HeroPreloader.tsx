"use client";

import { useEffect, useState } from "react";

// First-paint preloader for the landing hero. It fetches the hero's heavy assets (background photo,
// the plane, the wordmark), reports honest percentage progress, then fades out — so a cold load or a
// hard reload opens on a composed screen instead of a half-drawn hero. Shows once per page load:
// `shown` lives at module scope, so a soft client navigation skips it but a hard reload resets it.
const HERO_ASSETS = [
  "/img/hero-uluru.jpg",
  "/img/plane.png",
  "/brand/voyago-wordmark-white.png",
];
const FALLBACK_MS = 6000; // never trap the viewer if an asset stalls

let shown = false;

export default function HeroPreloader() {
  const [display, setDisplay] = useState(0); // the eased number on screen (0–100)
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(() => shown);

  useEffect(() => {
    if (shown) return;
    if (typeof window === "undefined") return;

    let target = 0; // real fraction loaded (0–1)
    let loaded = 0;
    const bump = () => {
      loaded += 1;
      target = loaded / HERO_ASSETS.length;
    };
    HERO_ASSETS.forEach((src) => {
      const img = new window.Image();
      img.onload = bump;
      img.onerror = bump; // a missing asset shouldn't wedge the screen
      img.src = src;
    });
    const fallback = window.setTimeout(() => {
      target = 1;
    }, FALLBACK_MS);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let cur = 0;
    let raf = 0;
    const finish = () => {
      shown = true;
      setFading(true);
      window.setTimeout(() => setDone(true), 520); // after the fade
    };
    const tick = () => {
      // Ease toward the real target, with a small crawl so the bar always feels alive, but never
      // run ahead of what has actually loaded.
      cur = Math.min(target, cur + (target - cur) * 0.08 + 0.004);
      setDisplay(Math.round(cur * 100));
      if (target >= 1 && cur >= 0.999) {
        setDisplay(100);
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    if (reduce) {
      // No crawl animation for reduced-motion: wait for the real loads, then fade.
      const poll = window.setInterval(() => {
        setDisplay(Math.round(target * 100));
        if (target >= 1) {
          window.clearInterval(poll);
          finish();
        }
      }, 120);
      return () => {
        window.clearInterval(poll);
        window.clearTimeout(fallback);
      };
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, []);

  if (done) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[200] grid place-items-center bg-[#071512] transition-opacity duration-[520ms] ease-out ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex w-[min(300px,74vw)] flex-col items-center gap-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/voyago-wordmark-white.png"
          alt="Voyago"
          className="h-auto w-[min(58vw,220px)] opacity-95 drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]"
        />
        <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-walshe-teal transition-[width] duration-150 ease-out"
            style={{ width: `${display}%` }}
          />
        </div>
        <div className="flex w-full items-center justify-between text-eyebrow uppercase tracking-[0.18em] text-white/55">
          <span>Preparing your journey</span>
          <span className="tabular-nums text-white/80">{display}%</span>
        </div>
      </div>
    </div>
  );
}

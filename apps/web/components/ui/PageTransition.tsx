"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// Page transition modelled on travelproductions.film (Elementor's page transition): a theme-aware
// panel (--transition-cover: near-black in dark, soft off-white in light) FADES IN while moving down
// to cover the screen, the route changes behind it, then the panel
// SLIDES DOWN off-screen to reveal the new page. Pure CSS animation (no GSAP) — light enough for
// every page. Internal link clicks are intercepted so the cover plays before navigation; external
// links, new-tab, hash, mailto/tel and modified clicks pass through untouched. Reduced-motion
// viewers get normal instant navigation.
type Phase = "idle" | "cover" | "covered" | "reveal";

function isReduced() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const pendingHref = useRef<string | null>(null);
  const lastPath = useRef(pathname);

  // Intercept same-origin link clicks: play the cover, then navigate.
  useEffect(() => {
    if (isReduced()) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // Inside the signed-in workspace, navigation uses the content sweep (AppShell), not the
      // full-screen black transition — so don't intercept clicks there.
      if (/^\/(agent|provider|admin)(\/|$)/.test(pathname)) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (
        !href ||
        target === "_blank" ||
        anchor.hasAttribute("download") ||
        href.startsWith("#") ||
        href.startsWith("http") ||
        href.startsWith("blob:") ||
        href.startsWith("data:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href === pathname
      ) {
        return; // let the browser / Next.js handle it normally (downloads, external, hash, etc.)
      }
      // Internal navigation — cover first, then push.
      e.preventDefault();
      e.stopPropagation();
      pendingHref.current = href;
      setPhase("cover");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // Once the new route has mounted (pathname changed while covering), reveal it.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setPhase((p) => (p === "cover" || p === "covered" ? "reveal" : p));
  }, [pathname]);

  const onAnimationEnd = useCallback(() => {
    setPhase((p) => {
      if (p === "cover") {
        if (pendingHref.current) {
          const href = pendingHref.current;
          pendingHref.current = null;
          router.push(href);
        }
        return "covered"; // hold the cover until the new route mounts
      }
      if (p === "reveal") return "idle";
      return p;
    });
  }, [router]);

  if (phase === "idle") return null;
  return <div aria-hidden className={`page-transition page-transition--${phase}`} onAnimationEnd={onAnimationEnd} />;
}

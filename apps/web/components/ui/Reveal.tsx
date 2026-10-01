"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

type Dir = "down" | "up" | "left" | "right";

// Scroll-reveal wrapper. Content renders immediately (SSR-friendly / visible to tests); when it
// scrolls into view, `.reveal-in` triggers a smooth fade in the chosen direction. Varying the
// direction across sections (down / up / left / right) gives the page rhythm and symmetry.
export default function Reveal({
  as: Tag = "div",
  className = "",
  dir = "down",
  delayMs = 0,
  children,
}: {
  as?: ElementType;
  className?: string;
  dir?: Dir;
  delayMs?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("reveal-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("reveal-in");
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} data-dir={dir} className={`reveal ${className}`} style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}>
      {children}
    </Tag>
  );
}

"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

// Scroll-reveal wrapper (vita-style smoothness). Content renders immediately (SSR-friendly and
// visible to tests / no-JS); when it scrolls into view, `.reveal-in` triggers a smooth fade+rise.
// The opacity:0 start is applied only under prefers-reduced-motion: no-preference (see globals.css).
export default function Reveal({
  as: Tag = "div",
  className = "",
  delayMs = 0,
  children,
}: {
  as?: ElementType;
  className?: string;
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
    <Tag ref={ref} className={`reveal ${className}`} style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}>
      {children}
    </Tag>
  );
}

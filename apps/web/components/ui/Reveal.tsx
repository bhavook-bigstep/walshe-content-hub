"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import gsap from "gsap";

// GSAP-driven scroll reveals, triggered by IntersectionObserver (reliable alongside Lenis). A
// caller picks a motion per content type:
//   • "chars"  — headings / subheadings: split into words+characters; each char rises + fades in
//                with a stagger (the reference site's smooth "write-on" cascade).
//   • "slidex" — cards: slide in from the left.
//   • "slidey" — paragraphs, lists, everything else: fade + move vertically (dir "up"/"down" =
//                the reference's fade-up / fade-down).
//   • "color"  — long paragraphs: fade + slide in, then a left-to-right colour sweep lifts the
//                text from a dull tint (--dull) to its full colour (--full).
// Content renders immediately (SSR / test friendly); the motion plays once it scrolls into view.
// Reduced-motion viewers get the final state with no animation. delayMs stages a section's
// elements in order of importance rather than all at once.
type Variant = "chars" | "slidex" | "slidey" | "color";
type Dir = "up" | "down";

function splitToSpans(text: string): ReactNode[] {
  const words = text.split(" ");
  const nodes: ReactNode[] = [];
  words.forEach((word, wi) => {
    nodes.push(
      <span key={`w${wi}`} className="rv-word">
        {Array.from(word).map((ch, ci) => (
          <span key={ci} className="rv-char">
            {ch}
          </span>
        ))}
      </span>,
    );
    if (wi < words.length - 1) nodes.push(<span key={`s${wi}`}> </span>);
  });
  return nodes;
}

export default function Reveal({
  as: Tag = "div",
  variant = "slidey",
  dir = "up",
  className = "",
  delayMs = 0,
  full,
  dull,
  children,
}: {
  as?: ElementType;
  variant?: Variant;
  dir?: Dir;
  className?: string;
  delayMs?: number;
  full?: string;
  dull?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const delay = delayMs / 1000;
    const chars = () => el.querySelectorAll(".rv-char");

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(el, { opacity: 1, clearProps: "transform" });
      if (variant === "chars") gsap.set(chars(), { opacity: 1, yPercent: 0 });
      if (variant === "color") gsap.set(el, { backgroundPosition: "0% 0%" });
      return;
    }

    let played = false;
    const play = () => {
      if (played) return;
      played = true;
      if (variant === "chars") {
        // Pure left-to-right appearance: each character fades in sequence, no vertical movement.
        gsap.set(el, { opacity: 1 });
        gsap.fromTo(
          chars(),
          { opacity: 0 },
          { opacity: 1, duration: 0.5, ease: "power1.out", stagger: 0.03, delay },
        );
      } else if (variant === "slidex") {
        gsap.fromTo(el, { x: -46, opacity: 0 }, { x: 0, opacity: 1, duration: 0.95, ease: "power3.out", delay });
      } else if (variant === "color") {
        gsap
          .timeline({ delay })
          .fromTo(el, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" })
          .to(el, { backgroundPosition: "0% 0%", duration: 1.2, ease: "power2.out" }, "-=0.1");
      } else {
        gsap.fromTo(
          el,
          { y: dir === "up" ? 30 : -30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.85, ease: "power3.out", delay },
        );
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          play();
          io.unobserve(el);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [variant, dir, delayMs]);

  const style =
    full || dull
      ? ({ ...(full ? { "--full": full } : {}), ...(dull ? { "--dull": dull } : {}) } as Record<string, string>)
      : undefined;

  // Char-split headings expose the real text as their accessible name and hide the visual split
  // spans from the a11y tree (otherwise the per-character spans fragment the computed name).
  const isChars = variant === "chars" && typeof children === "string";

  return (
    <Tag
      ref={ref}
      data-rv={variant}
      className={`rv ${className}`}
      style={style}
      {...(isChars ? { "aria-label": children as string } : {})}
    >
      {isChars ? <span aria-hidden="true">{splitToSpans(children as string)}</span> : children}
    </Tag>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Minimal accessible modal: dimmed backdrop + centered panel, Escape + backdrop-click to close.
// Portalled to <body> so no transformed/filtered ancestor can become the containing block of the
// `fixed` overlay (which would pin it to the top of scrolled content instead of the viewport).
const SIZE_CLASS = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  wide: "max-w-5xl",
} as const;

export default function Dialog({
  title,
  open,
  onClose,
  children,
  size = "lg",
  titleHidden = false,
  bodyClassName = "min-h-0 flex-1 overflow-y-auto p-5",
  ariaLabel,
}: {
  title: string;
  /** Accessible name when it should differ from the visible title. Defaults to `title`. */
  ariaLabel?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel max width. Defaults to `lg`; `wide` suits landscape/two-column content. */
  size?: keyof typeof SIZE_CLASS;
  /** Render the panel without the default header row (the content supplies its own). */
  titleHidden?: boolean;
  /** Override the scrolling body wrapper (e.g. to remove padding for edge-to-edge media). */
  bodyClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock the workspace scroller (AppShell's <main>) so the page behind doesn't scroll.
    const scroller = document.querySelector("main");
    const prevOverflow = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      if (scroller) scroller.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-walshe-deep/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* The panel is capped to the viewport and is a flex column: the header stays pinned and
          the body scrolls internally, so the dialog box itself never grows past the screen. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        className={`relative flex max-h-[88vh] w-full ${SIZE_CLASS[size]} flex-col overflow-hidden rounded-lg border border-walshe-line bg-walshe-base shadow-lift`}
        onClick={(e) => e.stopPropagation()}
      >
        {titleHidden ? (
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-walshe-base/80 text-walshe-ink shadow-sm backdrop-blur transition-colors hover:bg-walshe-base"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : (
          <div className="flex flex-none items-center justify-between border-b border-walshe-line px-5 py-3.5">
            <h2 className="text-h3 text-walshe-ink">{title}</h2>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-md text-walshe-grey transition-colors hover:bg-walshe-ink/10 hover:text-walshe-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

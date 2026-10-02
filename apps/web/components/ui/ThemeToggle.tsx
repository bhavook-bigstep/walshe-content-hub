"use client";

import { useEffect, useState } from "react";

// Light/dark toggle (AC30). The theme is applied before paint by an inline script in layout.tsx
// (default = OS preference); this control overrides it and remembers the choice per browser.
function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
  </svg>
);

export default function ThemeToggle({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("walsh-theme", next);
    } catch {
      /* storage blocked — theme still applies for this session */
    }
    setTheme(next);
  }

  const label = theme === "light" ? "Dark mode" : "Light mode";
  return (
    <button type="button" onClick={toggle} aria-label={`Switch to ${label.toLowerCase()}`} title={label} className={className}>
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
      {!compact && <span>{label}</span>}
    </button>
  );
}

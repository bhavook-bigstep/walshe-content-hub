// A small circular processing spinner (CSS-animated). Honours prefers-reduced-motion. Uses
// currentColor, so it takes the text colour of wherever it is placed.
export default function Spinner({ className = "", size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      className={`animate-spin motion-reduce:animate-none ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

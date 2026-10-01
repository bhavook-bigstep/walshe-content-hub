// Walshe wordmark lockup (AC21). No external logo asset is bundled (brief §6: don't invent/ship
// unlicensed brand assets), so this is a typographic mark built from the brand tokens: a square
// monogram tile + the product wordmark. `tone` flips it for teal vs light surfaces.
export default function WalsheLogo({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "teal";
  className?: string;
}) {
  const onTeal = tone === "teal";
  const tile = onTeal ? "bg-walshe-mint text-walshe-teal" : "bg-walshe-mint text-walshe-teal";
  const word = onTeal ? "text-walshe-white" : "text-walshe-ink";
  const sub = onTeal ? "text-walshe-mint" : "text-walshe-grey";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden
        className={`grid h-9 w-9 place-items-center rounded-sm text-base font-bold leading-none ${tile}`}
      >
        W
      </span>
      <span className="flex flex-col leading-none">
        <span className={`text-base font-semibold tracking-tight ${word}`}>Walshe</span>
        <span className={`text-[11px] font-medium uppercase tracking-[0.14em] ${sub}`}>Content Hub</span>
      </span>
    </span>
  );
}

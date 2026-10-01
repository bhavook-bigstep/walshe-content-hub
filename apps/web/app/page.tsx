import Link from "next/link";
import WalsheLogo from "../components/brand/WalsheLogo";

// Branded public landing page at / (AC20). Public route (not under the middleware matcher).
// Copy uses verbatim Walshe taglines/brand proof from the brief; demo figures are brand facts,
// not invented metrics. Imagery is abstract (no fabricated client photos/logos — brief §6).

const PROOF = [
  { value: "50", label: "years in business in 2026" },
  { value: "70", label: "people across the group" },
  { value: "6", label: "office locations" },
  { value: "17 yrs", label: "average partnership length" },
];

const VALUE_PROPS = [
  {
    title: "Verified content hub",
    body: "Tourism boards publish events, places, offers and itineraries. Only approved, brand-safe content reaches the trade.",
  },
  {
    title: "AI-assembled comms",
    body: "The Design Studio drafts a first-cut pamphlet, post or story from the catalog — then you refine it on the canvas.",
  },
  {
    title: "Trade personalization",
    body: "Tailor every asset to the agent's market and audience, with export to PNG, PDF and MP4.",
  },
  {
    title: "Social engagement",
    body: "Schedule and publish to connected channels, then read impressions, clicks and engagement in one view.",
  },
];

const AUDIENCES = [
  {
    name: "Content providers",
    body: "Destination marketers publish verified content and control exactly who may use it.",
  },
  {
    name: "Tourism agents",
    body: "Browse the approved catalog and turn it into marketing assets in minutes.",
  },
  {
    name: "Walshe admin",
    body: "Govern tenants, users and verification across the hub.",
  },
];

const FLOW = ["Browse", "Build", "Personalize", "Export", "Measure"];

export default function LandingPage() {
  return (
    <div className="bg-walshe-white text-walshe-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-walshe-teal-700 bg-walshe-teal">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <WalsheLogo tone="teal" />
          <nav aria-label="Marketing" className="flex items-center gap-2 sm:gap-4">
            <a href="#audiences" className="hidden rounded-sm px-3 py-2 text-small font-medium text-walshe-mint/80 hover:text-walshe-white sm:inline">
              For the trade
            </a>
            <a href="#how" className="hidden rounded-sm px-3 py-2 text-small font-medium text-walshe-mint/80 hover:text-walshe-white sm:inline">
              How it works
            </a>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-pill border border-walshe-mint px-5 py-2 text-small font-medium text-walshe-mint transition-colors hover:bg-walshe-mint hover:text-walshe-teal"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-walshe-teal text-walshe-mint">
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24 lg:px-8">
          <div>
            <p className="mb-4 text-small font-medium uppercase tracking-[0.14em] text-walshe-mint/80">
              Premium brands, trusted outcomes
            </p>
            <h1 className="text-h1 font-light tracking-tight text-walshe-white sm:text-display">
              Verified destination content, assembled into trade-ready marketing in minutes.
            </h1>
            <p className="mt-6 max-w-xl text-lg font-light leading-relaxed text-walshe-mint">
              The Walshe Content Hub gives destination marketing &amp; regenerative tourism partners one place to
              publish verified content, and the trade one place to turn it into on-brand assets.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {/* Primary: filled mint pill. */}
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-pill bg-walshe-mint px-7 py-3 text-small font-semibold text-walshe-teal transition-colors hover:bg-walshe-white"
              >
                Sign in
              </Link>
              {/* Secondary: 2px outline, transparent fill (brief §5). Mint outline — teal would be
                  invisible on the teal hero; the outline/fill contrast differentiates it from the
                  primary. */}
              <a
                href="#how"
                className="inline-flex min-h-12 items-center justify-center rounded-pill border-2 border-walshe-mint bg-transparent px-7 py-3 text-small font-semibold text-walshe-mint transition-colors hover:bg-walshe-teal-700"
              >
                See how it works
              </a>
            </div>
            <p className="mt-8 text-small text-walshe-mint/70">
              Airline GSA &amp; approved service provider · Celebrating 50 years in business in 2026
            </p>
          </div>
          {/* Abstract destination imagery (no fabricated photography). */}
          <div aria-hidden className="relative hidden h-80 lg:block">
            <div className="absolute right-0 top-0 h-56 w-56 rounded-md bg-gradient-to-br from-walshe-mint/90 to-walshe-teal-100 shadow-soft" />
            <div className="absolute left-4 top-24 h-48 w-48 rounded-md bg-gradient-to-tr from-walshe-green/70 to-walshe-mint/60 shadow-soft" />
            <div className="absolute bottom-0 right-16 h-40 w-64 rounded-md bg-walshe-teal-700/60 ring-1 ring-walshe-mint/30" />
          </div>
        </div>
      </section>

      {/* Proof band */}
      <section className="border-y border-walshe-stone bg-walshe-stone">
        <div className="mx-auto grid max-w-content grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
          {PROOF.map((p) => (
            <div key={p.label}>
              <p className="text-h1 font-light text-walshe-teal">{p.value}</p>
              <p className="mt-1 text-small text-walshe-grey">{p.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Audiences */}
      <section id="audiences" className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-h2 font-light text-walshe-ink">One hub, three roles</h2>
        <p className="mt-2 max-w-2xl text-body text-walshe-grey">
          A destination content hub built for the trade — the destination marketing &amp; regenerative tourism
          specialist&apos;s way of working, online.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.name} className="card card-hover p-6">
              <h3 className="text-h3 font-bold text-walshe-teal">{a.name}</h3>
              <p className="mt-2 text-body text-walshe-grey">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Value props */}
      <section className="bg-walshe-stone">
        <div className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-h2 font-light text-walshe-ink">From brief to published</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {VALUE_PROPS.map((v, i) => (
              <div key={v.title} className="card flex gap-4 p-6">
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-walshe-teal text-base font-bold text-walshe-mint"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-h3 font-bold text-walshe-ink">{v.title}</h3>
                  <p className="mt-1 text-body text-walshe-grey">{v.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works / flow */}
      <section id="how" className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-h2 font-light text-walshe-ink">From brief to published in minutes</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {FLOW.map((step, i) => (
            <li key={step} className="card flex items-center gap-3 p-5">
              <span className="text-h3 font-light text-walshe-teal tabular-nums">{i + 1}</span>
              <span className="text-body font-medium text-walshe-ink">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing CTA */}
      <section className="bg-walshe-teal text-walshe-mint">
        <div className="mx-auto flex max-w-content flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2 className="text-h2 font-light text-walshe-white">Ready to assemble your next campaign?</h2>
            <p className="mt-2 text-body text-walshe-mint">Sign in to browse verified content and build in the studio.</p>
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center justify-center rounded-pill bg-walshe-mint px-7 py-3 text-small font-semibold text-walshe-teal transition-colors hover:bg-walshe-white"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-walshe-stone bg-walshe-white">
        <div className="mx-auto flex max-w-content flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <WalsheLogo tone="light" />
          <div className="text-small text-walshe-grey">
            <p>Destination marketing &amp; regenerative tourism specialist.</p>
            <p className="mt-1">Celebrating 50 years in business in 2026 · Premium brands, trusted outcomes.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

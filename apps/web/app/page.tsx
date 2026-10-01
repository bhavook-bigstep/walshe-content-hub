import Link from "next/link";
import Reveal from "../components/ui/Reveal";

// Public landing (AC20) — immersive editorial direction: full-bleed cinematic photography, large
// light-weight headlines, alternating deep-teal sections, portrait content grid, big light stats.
// Original Walshe copy + curated scenic imagery.

const IMG = (id: number, w = 1600, h = 1000) => `https://picsum.photos/id/${id}/${w}/${h}`;

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="h-px w-7 bg-walshe-amber" />
      <span className={`text-eyebrow uppercase ${light ? "text-white/70" : "text-walshe-grey"}`}>{children}</span>
    </span>
  );
}

function Wordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-walshe-amber text-[17px] font-bold text-walshe-ink">W</span>
      <span className={`text-[19px] font-semibold tracking-tight ${onDark ? "text-white" : "text-walshe-ink"}`}>Walshe</span>
    </span>
  );
}

const CATALOG = [
  { id: 1015, title: "Harbour Festival", meta: "Event · Galway", countries: "12 assets" },
  { id: 1016, title: "Cliffs of Moher", meta: "Place · Clare", countries: "20 assets" },
  { id: 1036, title: "Trade Showcase", meta: "Opportunity · Dublin", countries: "8 assets" },
];

export default function Landing() {
  return (
    <main className="bg-walshe-paper">
      {/* ======================= HERO ======================= */}
      <header className="relative flex min-h-[94vh] flex-col overflow-hidden text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG(1018, 2000, 1300)} alt="" className="absolute inset-0 z-0 h-full w-full object-cover" />
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(7,20,24,.58)_0%,rgba(7,20,24,.14)_32%,rgba(7,20,24,.22)_68%,rgba(7,20,24,.66)_100%)]" />

        <nav className="relative z-10 mx-auto flex w-full max-w-content items-center gap-6 px-7 py-6">
          <Link href="/"><Wordmark onDark /></Link>
          <div className="ml-auto hidden items-center gap-8 md:flex">
            {["For the trade", "Destinations", "How it works"].map((l) => (
              <span key={l} className="cursor-default text-[15px] font-medium text-white/85 transition-colors hover:text-white">{l}</span>
            ))}
            <span className="h-6 w-px bg-white/25" />
            <Link href="/login" className="text-[15px] font-semibold text-white">Sign in</Link>
          </div>
          <Link href="/login" className="ml-auto md:ml-0 inline-flex items-center rounded-pill bg-white px-5 py-2.5 text-[14px] font-semibold text-walshe-ink transition-transform hover:-translate-y-0.5">Get started</Link>
        </nav>

        <div className="relative z-10 mx-auto flex w-full max-w-content flex-1 flex-col items-center justify-center px-7 pb-24 text-center">
          <Reveal><Eyebrow light>The destination content hub</Eyebrow></Reveal>
          <Reveal as="h1" className="mt-7 max-w-[16ch] text-[clamp(52px,9vw,116px)] font-light leading-[0.95] tracking-[-0.04em]" delayMs={80}>
            Verified destinations
          </Reveal>
          <Reveal as="p" className="mt-7 max-w-[46ch] text-[clamp(17px,2vw,21px)] font-light text-white/85" delayMs={160}>
            Publish verified content once. 10,000 travel agents turn it into on-brand campaigns — imagery, posts, pamphlets and video — without leaving the hub.
          </Reveal>
          <Reveal className="mt-10" delayMs={240}>
            <Link href="/login" className="inline-flex items-center gap-3 rounded-pill bg-white py-4 pl-7 pr-5 text-[15px] font-semibold text-walshe-ink transition-transform hover:-translate-y-0.5">
              Explore the catalog
              <span className="grid h-7 w-7 place-items-center rounded-full bg-walshe-ink text-white">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          </Reveal>
        </div>
      </header>

      {/* ======================= STATEMENT (dark) ======================= */}
      <section className="bg-walshe-ink py-28 text-white">
        <div className="mx-auto max-w-content px-7">
          <Reveal><Eyebrow light>Why Walshe</Eyebrow></Reveal>
          <Reveal as="h2" className="mt-8 max-w-[22ch] text-[clamp(32px,5.2vw,72px)] font-light leading-[1.02] tracking-[-0.03em]" delayMs={80}>
            Content the trade can trust, in more than six markets.
          </Reveal>
        </div>
      </section>

      {/* ======================= CATALOG GRID (dark) ======================= */}
      <section className="bg-walshe-ink pb-28 text-white">
        <div className="mx-auto max-w-content px-7">
          <div className="grid gap-x-0 gap-y-12 border-t border-white/12 sm:grid-cols-2 lg:grid-cols-3 lg:divide-x lg:divide-white/12">
            {CATALOG.map((c, i) => (
              <Reveal key={c.title} className={`pt-8 ${i > 0 ? "lg:pl-8" : ""} ${i < CATALOG.length - 1 ? "lg:pr-8" : ""}`} delayMs={i * 90}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[22px] font-medium tracking-tight">{c.title}</h3>
                  <span className="whitespace-nowrap text-small text-white/55">/ {c.countries}</span>
                </div>
                <div className="group mt-5 overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={IMG(c.id, 800, 1000)} alt={c.title} className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                </div>
                <p className="mt-4 text-small text-white/60">{c.meta}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ======================= ABOUT (editorial split) ======================= */}
      <section className="py-28">
        <div className="mx-auto max-w-content px-7">
          <Reveal><Eyebrow>The hub</Eyebrow></Reveal>
          <Reveal as="h2" className="mt-8 max-w-[20ch] text-[clamp(30px,4.6vw,60px)] font-light leading-[1.04] tracking-[-0.03em] text-walshe-ink" delayMs={80}>
            Not just a library — a way of working, for the whole trade.
          </Reveal>
          <div className="mt-14 grid items-start gap-12 lg:grid-cols-2">
            <Reveal className="overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={IMG(1039, 1100, 1300)} alt="" className="aspect-[5/6] w-full object-cover" />
            </Reveal>
            <Reveal delayMs={120}>
              <p className="max-w-[46ch] text-[clamp(18px,2.1vw,24px)] font-light leading-snug text-walshe-ink">
                The Walshe Content Hub blends a verified destination catalog with a Canva-style studio and an AI Builder — so an agent can go from brief to published campaign without leaving one place.
              </p>
              <div className="mt-14 grid grid-cols-2 gap-10">
                {[["10,000", "Trade agents reached"], ["50 yrs", "In travel, in 2026"], ["100%", "Brand-verified content"], ["6", "Destination markets"]].map(([k, l]) => (
                  <div key={l}>
                    <div className="text-[clamp(40px,5vw,64px)] font-light leading-none tracking-[-0.03em] text-walshe-ink">{k}</div>
                    <div className="mt-3 text-small font-medium text-walshe-grey">{l}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ======================= STEPS (dark) ======================= */}
      <section className="bg-walshe-teal py-28 text-white">
        <div className="mx-auto max-w-content px-7">
          <Reveal><Eyebrow light>How it works</Eyebrow></Reveal>
          <Reveal as="h2" className="mt-8 max-w-[18ch] text-[clamp(30px,4.6vw,60px)] font-light leading-[1.04] tracking-[-0.03em]" delayMs={80}>
            From verified content to published campaign.
          </Reveal>
          <div className="mt-16 grid gap-x-10 gap-y-12 border-t border-white/12 pt-12 sm:grid-cols-2 lg:grid-cols-4">
            {[["01", "Browse", "Search the approved catalog by destination, season or type."], ["02", "Build", "Compose in the studio, or let the AI Builder draft it from the content."], ["03", "Personalise", "Add your logo, contact and offers — on-brand, automatically."], ["04", "Publish", "Export or schedule to social, then track impressions and clicks."]].map(([n, t, b], i) => (
              <Reveal key={n} delayMs={i * 80}>
                <div className="text-small font-semibold text-walshe-amber">{n}</div>
                <h3 className="mt-4 text-[22px] font-medium tracking-tight">{t}</h3>
                <p className="mt-3 text-small leading-relaxed text-white/65">{b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ======================= CTA ======================= */}
      <section className="py-32">
        <div className="mx-auto max-w-content px-7 text-center">
          <Reveal as="h2" className="mx-auto max-w-[18ch] text-[clamp(34px,6vw,84px)] font-light leading-[1.0] tracking-[-0.035em] text-walshe-ink">
            Put verified content to work.
          </Reveal>
          <Reveal className="mt-10 flex justify-center" delayMs={120}>
            <Link href="/login" className="inline-flex items-center gap-3 rounded-pill bg-walshe-ink py-4 pl-7 pr-5 text-[15px] font-semibold text-white transition-transform hover:-translate-y-0.5">
              Get started
              <span className="grid h-7 w-7 place-items-center rounded-full bg-walshe-amber text-walshe-ink">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ======================= FOOTER ======================= */}
      <footer className="border-t border-walshe-line py-12">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-4 px-7">
          <Wordmark />
          <span className="ml-auto text-small text-walshe-grey">Destination marketing &amp; regenerative tourism · 50 years in 2026</span>
        </div>
      </footer>
    </main>
  );
}

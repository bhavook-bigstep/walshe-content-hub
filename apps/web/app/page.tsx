import Link from "next/link";
import Reveal from "../components/ui/Reveal";

// Public landing (AC20) — immersive editorial direction modelled on the reference's structure:
// full-bleed cinematic hero with a framed nav, 2-column section headers (small eyebrow left, large
// light headline right), and a "retreats"-style grid (title + /meta above a tall portrait image,
// hairline dividers). Original Walshe copy + curated scenic imagery.

const IMG = (id: number, w = 1600, h = 1000) => `https://picsum.photos/id/${id}/${w}/${h}`;

function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2l2.2 7.1L21.5 9l-5.9 4.3 2.3 7-5.9-4.4L6.1 20.3l2.3-7L2.5 9l7.3.1z" opacity=".9" />
    </svg>
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

// 2-column section header (reference pattern): small marked eyebrow left, big light headline right.
function SectionHead({ eyebrow, title, dark = false }: { eyebrow: string; title: string; dark?: boolean }) {
  return (
    <div className={`grid gap-6 border-t pt-8 md:grid-cols-[minmax(0,2.4fr)_minmax(0,9fr)] md:gap-12 ${dark ? "border-white/15" : "border-walshe-line"}`}>
      <Reveal className="flex items-center gap-2.5">
        <Mark className={`h-4 w-4 ${dark ? "text-walshe-amber" : "text-walshe-amber"}`} />
        <span className={`text-eyebrow uppercase ${dark ? "text-white/60" : "text-walshe-grey"}`}>{eyebrow}</span>
      </Reveal>
      <Reveal as="h2" className={`max-w-[20ch] text-[clamp(30px,4.6vw,64px)] font-light leading-[1.03] tracking-[-0.03em] ${dark ? "text-white" : "text-walshe-ink"}`} delayMs={80}>
        {title}
      </Reveal>
    </div>
  );
}

const CATALOG = [
  { id: 1015, title: "Harbour Festival", meta: "Event · Galway", tag: "/ 12 assets" },
  { id: 1016, title: "Cliffs of Moher", meta: "Place · Clare", tag: "/ 20 assets" },
  { id: 1036, title: "Trade Showcase", meta: "Opportunity · Dublin", tag: "/ 8 assets" },
];

const STEPS = [
  { n: "01", t: "Browse", b: "Search the approved catalog by destination, season or type." },
  { n: "02", t: "Build", b: "Compose in the studio, or let the AI Builder draft it from the content." },
  { n: "03", t: "Personalise", b: "Add your logo, contact and offers — on-brand, automatically." },
  { n: "04", t: "Publish", b: "Export or schedule to social, then track impressions and clicks." },
];

export default function Landing() {
  return (
    <main className="bg-walshe-paper">
      {/* ======================= HERO ======================= */}
      <header className="relative min-h-[94vh] overflow-hidden text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG(1018, 2000, 1300)} alt="" className="absolute inset-0 z-0 h-full w-full object-cover" />
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(7,20,24,.5)_0%,rgba(7,20,24,.1)_30%,rgba(7,20,24,.18)_66%,rgba(7,20,24,.62)_100%)]" />

        {/* Framed nav: logo bay · links · divider · CTA bay, with a bottom hairline (movie-frame). */}
        <nav className="relative z-10 flex h-[76px] items-stretch border-b border-white/15 text-[15px]">
          <Link href="/" className="flex items-center border-r border-white/15 px-7">
            <Wordmark onDark />
          </Link>
          <div className="hidden flex-1 items-center justify-end gap-9 px-8 lg:flex">
            {["For the trade", "Destinations", "How it works"].map((l) => (
              <span key={l} className="cursor-default font-medium text-white/85 transition-colors hover:text-white">{l}</span>
            ))}
          </div>
          <Link href="/login" className="ml-auto flex items-center border-l border-white/15 px-7 font-semibold text-white lg:ml-0">
            Sign in
          </Link>
          <Link href="/login" className="hidden items-center border-l border-white/15 px-7 font-semibold text-white transition-colors hover:bg-white/10 lg:flex">
            Explore
          </Link>
        </nav>

        <div className="relative z-10 mx-auto flex min-h-[calc(94vh-76px)] w-full max-w-[1100px] flex-col items-center justify-center px-7 pb-24 pt-10 text-center">
          <Reveal as="h1" className="max-w-[18ch] text-[clamp(56px,10vw,132px)] font-light leading-[0.92] tracking-[-0.045em]">
            Verified destinations
          </Reveal>
          <Reveal as="p" className="mt-8 max-w-[44ch] text-[clamp(17px,2vw,22px)] font-light leading-snug text-white/90" delayMs={120}>
            Publish verified content once. The trade turns it into on-brand campaigns — in minutes.
          </Reveal>
          <Reveal className="mt-10" delayMs={220}>
            <Link href="/login" className="inline-flex items-center gap-3 rounded-pill bg-white py-4 pl-7 pr-5 text-[15px] font-semibold text-walshe-ink transition-transform hover:-translate-y-0.5">
              Explore the catalog
              <span className="grid h-7 w-7 place-items-center rounded-full bg-walshe-ink text-white">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          </Reveal>
        </div>
      </header>

      {/* ======================= VERIFIED CATALOG (retreats-style, dark) ======================= */}
      <section className="bg-walshe-ink py-24 text-white">
        <div className="mx-auto max-w-content px-7">
          <SectionHead eyebrow="Verified catalog" title="Content the trade can trust, in more than six markets." dark />
          <div className="mt-16 grid gap-y-14 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-0 lg:divide-x lg:divide-white/12">
            {CATALOG.map((c, i) => (
              <Reveal key={c.title} className={`${i > 0 ? "lg:pl-10" : ""} ${i < CATALOG.length - 1 ? "lg:pr-10" : ""}`} delayMs={i * 90}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[21px] font-medium tracking-tight">{c.title}</h3>
                  <span className="whitespace-nowrap text-small text-white/50">{c.tag}</span>
                </div>
                <div className="group mt-6 overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={IMG(c.id, 820, 1040)} alt={c.title} className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                </div>
                <p className="mt-5 text-small text-white/55">{c.meta}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ======================= ABOUT (editorial split) ======================= */}
      <section className="py-24">
        <div className="mx-auto max-w-content px-7">
          <SectionHead eyebrow="The hub" title="Not just a library — a way of working, for the whole trade." />
          <div className="mt-16 grid items-start gap-12 lg:grid-cols-2">
            <Reveal className="overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={IMG(1039, 1100, 1300)} alt="" className="aspect-[5/6] w-full object-cover" />
            </Reveal>
            <Reveal delayMs={120}>
              <p className="max-w-[46ch] text-[clamp(18px,2.1vw,24px)] font-light leading-snug text-walshe-ink">
                The Walshe Content Hub blends a verified destination catalog with a Canva-style studio and an AI Builder — so an agent can go from brief to published campaign without leaving one place.
              </p>
              <div className="mt-14 grid grid-cols-2 gap-x-10 gap-y-12">
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
      <section className="bg-walshe-teal py-24 text-white">
        <div className="mx-auto max-w-content px-7">
          <SectionHead eyebrow="How it works" title="From verified content to published campaign." dark />
          <div className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delayMs={i * 80}>
                <div className="text-small font-semibold text-walshe-amber">{s.n}</div>
                <h3 className="mt-4 text-[21px] font-medium tracking-tight">{s.t}</h3>
                <p className="mt-3 text-small leading-relaxed text-white/60">{s.b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ======================= CTA ======================= */}
      <section className="py-32">
        <div className="mx-auto max-w-content px-7 text-center">
          <Reveal as="h2" className="mx-auto max-w-[16ch] text-[clamp(36px,6.5vw,92px)] font-light leading-[0.98] tracking-[-0.04em] text-walshe-ink">
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

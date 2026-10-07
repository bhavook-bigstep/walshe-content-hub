import Link from "next/link";
import Reveal from "../components/ui/Reveal";
import SmoothScroll from "../components/ui/SmoothScroll";
import SiteNav from "../components/site/SiteNav";
import HeroFlight from "../components/site/HeroFlight";

// Public landing (AC20) — immersive editorial direction modelled on the reference's structure:
// full-bleed cinematic hero with a framed nav, 2-column section headers (small eyebrow left, large
// light headline right), and a "retreats"-style grid (title + /meta above a tall portrait image,
// hairline dividers). Original Walshe copy + curated scenic imagery.

function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2l2.2 7.1L21.5 9l-5.9 4.3 2.3 7-5.9-4.4L6.1 20.3l2.3-7L2.5 9l7.3.1z" opacity=".9" />
    </svg>
  );
}
// 2-column section header (reference pattern): small marked eyebrow left, big light headline right.
function SectionHead({ eyebrow, title, dark = false }: { eyebrow: string; title: string; dark?: boolean }) {
  return (
    <div className={`grid gap-6 border-t pt-8 md:grid-cols-[minmax(0,2.4fr)_minmax(0,9fr)] md:gap-12 ${dark ? "border-white/15" : "border-walshe-line"}`}>
      <Reveal variant="slidey" dir="down" className="flex items-center gap-2.5">
        <Mark className={`h-4 w-4 ${dark ? "text-walshe-mint" : "text-walshe-mint"}`} />
        <span className={`text-eyebrow uppercase ${dark ? "text-white/60" : "text-walshe-grey"}`}>{eyebrow}</span>
      </Reveal>
      <Reveal as="h2" variant="chars" delayMs={160} className={`font-display max-w-[20ch] text-[clamp(30px,4.6vw,64px)] font-semibold leading-[1.05] tracking-[-0.04em] ${dark ? "text-white" : "text-walshe-ink"}`}>
        {title}
      </Reveal>
    </div>
  );
}

const ArrowIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
const CheckIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>);
// Audience-side glyphs: a broadcast tower (boards publish out) and a sparkle wand (agents create).
const BroadcastIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="11" r="2" /><path d="M12 13v8M8.5 7.5a5 5 0 0 0 0 7M15.5 7.5a5 5 0 0 1 0 7M6 5a9 9 0 0 0 0 12M18 5a9 9 0 0 1 0 12" /></svg>);
const WandIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m4 20 10-10M14.5 5.5l4 4M17 3l.7 1.8L19.5 5.5l-1.8.7L17 8l-.7-1.8L14.5 5.5l1.8-.7zM6 12l.5 1.3L7.8 13.8l-1.3.5L6 15.6l-.5-1.3L4.2 13.8l1.3-.5z" /></svg>);

// The two sides of the hub (the product's core shape): tourism boards publish verified content;
// travel agents turn it into campaigns. Mirrors the Content Provider / Tourism Agent roles.
const AUDIENCES = [
  {
    role: "Tourism boards · Content providers",
    title: "Publish once, verified.",
    blurb: "Load your destination’s events, places, offers and itineraries, mark them brand-safe, and set exactly who can use them. Nothing reaches an agent until it’s approved.",
    points: ["Events, places, offers & itineraries", "Brand-safety and verification built in", "You control access, per market"],
    cta: "Become a provider",
    icon: <BroadcastIcon />,
  },
  {
    role: "Travel agents · Tourism agents",
    title: "Build campaigns, fast.",
    blurb: "Browse the approved catalog, compose in the AI studio, drop in your logo and offers, then export or schedule straight to social — and watch the engagement come back.",
    points: ["AI Builder drafts from real content", "Your brand applied automatically", "Publish and track across social"],
    cta: "Start creating",
    icon: <WandIcon />,
  },
];

// Product-in-action: real UI screenshots (theme-matched — a light shot in light mode, a dark shot
// in dark mode) with a short description of each surface.
const PRODUCT = [
  {
    eyebrow: "Design studio",
    title: "Build campaigns on an infinite canvas.",
    blurb: "Compose scenes, apply your brand kit in a click, and let the AI Builder draft copy and layout from real catalog content — then export to PNG, PDF or MP4, or schedule straight to social.",
    cta: "Open the studio",
    shotLight: "/img/hero-studio-light.png",
    shotDark: "/img/hero-studio-dark.png",
    alt: "The Voyago design studio — campaign scenes on the canvas",
  },
  {
    eyebrow: "Verified catalog",
    title: "Only approved, brand-safe content.",
    blurb: "Browse events, places, offers and itineraries published by tourism boards — every item verified and brand-safe before it reaches you. Filter by destination, season or type.",
    cta: "Explore the catalog",
    shotLight: "/img/hero-catalog-light.png",
    shotDark: "/img/hero-catalog-dark.png",
    alt: "The Voyago verified catalog",
  },
];

const STEPS = [
  { n: "01", t: "Browse", b: "Search the approved catalog by destination, season or type." },
  { n: "02", t: "Build", b: "Compose in the studio, or let the AI Builder draft it from the content." },
  { n: "03", t: "Personalise", b: "Add your logo, contact and offers — on-brand, automatically." },
  { n: "04", t: "Publish", b: "Export or schedule to social, then track impressions and clicks." },
];

// Footer (modelled on walshegroup.com) — three link columns + the group's public contact details.
const FOOTER_COLS = [
  { head: "Information", links: [
    { label: "About Us", href: "#" },
    { label: "Airline Services", href: "#" },
    { label: "Destination Services", href: "#" },
  ] },
  { head: "Helpful Links", links: [
    { label: "Our Work", href: "#" },
    { label: "Industry News", href: "#" },
    { label: "For the Trade", href: "#" },
  ] },
  { head: "Contact", links: [
    { label: "info@walshegroup.com", href: "mailto:info@walshegroup.com" },
    { label: "AU: +61 2 9286 8927", href: "tel:+61292868927" },
    { label: "NZ: +64 9 977 2200", href: "tel:+6499772200" },
  ] },
];

const SOCIALS = [
  { label: "Facebook", href: "#", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H7v3h3v6h3v-6h3l1-3h-4v-2c0-.6.4-1 1-1z" /></svg>) },
  { label: "Instagram", href: "#", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" /></svg>) },
  { label: "LinkedIn", href: "#", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6.94 7.5a1.56 1.56 0 11-.02-3.12A1.56 1.56 0 016.94 7.5zM5.5 9h2.9v9.5H5.5V9zm5 0h2.78v1.3h.04c.39-.73 1.33-1.5 2.74-1.5 2.93 0 3.47 1.93 3.47 4.44v5.26h-2.9v-4.67c0-1.11-.02-2.54-1.55-2.54-1.55 0-1.79 1.21-1.79 2.46v4.75H10.5V9z" /></svg>) },
];

export default function Landing() {
  return (
    <main className="bg-walshe-paper [overflow-x:clip]">
      <SmoothScroll />
      <SiteNav />
      {/* Hero + scroll-scrubbed plane wipe into the first section. */}
      <HeroFlight />

      {/* ======================= PRODUCT IN ACTION (real UI, theme-matched) ======================= */}
      <section id="product" className="scroll-mt-24 py-24">
        <div className="mx-auto max-w-content px-7">
          <SectionHead eyebrow="See it in action" title="The studio and the verified catalog, in one place." />
          <div className="mt-16 space-y-20 lg:space-y-28">
            {PRODUCT.map((p, i) => {
              const flip = i % 2 === 1; // alternate the image side row to row
              return (
                <div key={p.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                  {/* Text — each element reveals in turn (fade-up stagger), like the original cards. */}
                  <div className={flip ? "lg:order-2" : ""}>
                    <Reveal variant="slidey" dir="down" delayMs={120} className="eyebrow">{p.eyebrow}</Reveal>
                    <Reveal as="h3" variant="slidey" dir="up" delayMs={200} className="font-display mt-3 max-w-[18ch] text-[clamp(26px,3.4vw,40px)] font-semibold leading-tight tracking-[-0.03em] text-walshe-ink">{p.title}</Reveal>
                    <Reveal as="p" variant="slidey" dir="up" delayMs={300} className="mt-5 max-w-[46ch] text-body text-walshe-grey">{p.blurb}</Reveal>
                    <Reveal variant="slidey" dir="up" delayMs={400} className="mt-7">
                      <Link href="/login" className="inline-flex items-center gap-2 text-small font-semibold text-walshe-mint transition-all hover:gap-3">
                        {p.cta} <ArrowIcon />
                      </Link>
                    </Reveal>
                  </div>
                  {/* Screenshot — slides in like a card. */}
                  <Reveal variant="slidex" className={flip ? "lg:order-1" : ""}>
                    <div className="overflow-hidden rounded-xl border border-walshe-line shadow-lift">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.shotLight} alt={p.alt} loading="lazy" className="theme-light-only w-full" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.shotDark} alt={p.alt} loading="lazy" className="theme-dark-only w-full" />
                    </div>
                  </Reveal>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================= AUDIENCES (the two sides of the hub) ======================= */}
      <section id="audiences" className="scroll-mt-24 py-24">
        <div className="mx-auto max-w-content px-7">
          <SectionHead eyebrow="Who it's for" title="One hub, two sides of the trade." />
          <div className="mt-16 grid gap-7 lg:grid-cols-2">
            {AUDIENCES.map((a, i) => {
              const base = i * 150; // each card slides in after the one before it…
              return (
                <Reveal key={a.title} variant="slidex" delayMs={base} className="h-full">
                  {/* …then its contents cascade in (fade-up stagger), the original cards' rule. */}
                  <article className="card flex h-full flex-col p-8 sm:p-10">
                    <Reveal variant="slidey" dir="down" delayMs={base + 140}>
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-walshe-mint/15 text-walshe-mint">{a.icon}</span>
                    </Reveal>
                    <Reveal variant="slidey" dir="up" delayMs={base + 220} className="mt-6 text-eyebrow uppercase text-walshe-grey">{a.role}</Reveal>
                    <Reveal as="h3" variant="slidey" dir="up" delayMs={base + 300} className="mt-2.5 font-display text-[clamp(24px,3.2vw,36px)] font-semibold leading-tight tracking-[-0.03em] text-walshe-ink">{a.title}</Reveal>
                    <Reveal as="p" variant="slidey" dir="up" delayMs={base + 380} className="mt-4 max-w-[44ch] text-body text-walshe-grey">{a.blurb}</Reveal>
                    <Reveal as="ul" variant="slidey" dir="up" delayMs={base + 460} className="mt-7 space-y-3">
                      {a.points.map((p) => (
                        <li key={p} className="flex items-start gap-3 text-small text-walshe-ink">
                          <span className="mt-0.5 flex-none text-walshe-mint"><CheckIcon /></span>
                          {p}
                        </li>
                      ))}
                    </Reveal>
                    <Reveal variant="slidey" dir="up" delayMs={base + 540} className="mt-8">
                      <Link href="/login" className="inline-flex items-center gap-2 text-small font-semibold text-walshe-mint transition-all hover:gap-3">
                        {a.cta} <ArrowIcon />
                      </Link>
                    </Reveal>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>


      {/* ======================= ABOUT (editorial split) ======================= */}
      <section id="the-hub" className="scroll-mt-24 py-24">
        <div className="mx-auto max-w-content px-7">
          <SectionHead eyebrow="The hub" title="Not just a library — a way of working, for the whole trade." />
          <div className="mt-16 grid items-start gap-12 lg:grid-cols-2">
            <Reveal variant="slidey" dir="down" delayMs={100} className="overflow-hidden rounded-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/skyline-nyc.jpg" alt="Manhattan skyline at golden hour" className="aspect-[5/6] w-full object-cover" />
            </Reveal>
            <div>
              <Reveal as="p" variant="color" dir="up" delayMs={250} className="max-w-[46ch] text-[clamp(18px,2.1vw,24px)] font-light leading-snug text-walshe-ink">
                Voyago blends a verified destination catalog with a Canva-style studio and an AI Builder — so an agent can go from brief to published campaign without leaving one place. Built and backed by The Walshe Group’s 50 years in travel.
              </Reveal>
              <div className="mt-14 grid grid-cols-2 gap-x-10 gap-y-12">
                {[["10,000", "Trade agents reached"], ["50 yrs", "In travel, in 2026"], ["100%", "Brand-verified content"], ["6", "Destination markets"]].map(([k, l], i) => (
                  <Reveal key={l} variant="slidey" dir="up" delayMs={450 + i * 130}>
                    <div className="font-display text-[clamp(40px,5vw,64px)] font-semibold leading-none tracking-[-0.045em] text-walshe-ink">{k}</div>
                    <div className="mt-3 text-small font-medium text-walshe-grey">{l}</div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================= STEPS (dark) ======================= */}
      <section id="how-it-works" className="scroll-mt-24 border-t border-walshe-line py-24">
        <div className="mx-auto max-w-content px-7">
          <SectionHead eyebrow="How it works" title="From verified content to published campaign." />
          <div className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} variant="slidey" dir="up" delayMs={i * 140}>
                <div className="text-small font-semibold text-walshe-mint">{s.n}</div>
                <h3 className="mt-4 text-[21px] font-medium tracking-tight text-walshe-ink">{s.t}</h3>
                <p className="mt-3 text-small leading-relaxed text-walshe-grey">{s.b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ======================= CTA ======================= */}
      <section className="py-32">
        <div className="mx-auto max-w-content px-7 text-center">
          <Reveal as="h2" variant="chars" className="font-display mx-auto max-w-[16ch] text-[clamp(36px,6.5vw,88px)] font-semibold leading-[1.0] tracking-[-0.05em] text-walshe-ink">
            Put verified content to work.
          </Reveal>
          <Reveal variant="slidey" dir="up" className="mt-10 flex justify-center" delayMs={260}>
            <Link href="/login" className="inline-flex items-center gap-3 rounded-pill bg-white py-4 pl-7 pr-5 text-[15px] font-semibold text-walshe-teal transition-transform hover:-translate-y-0.5">
              Get started
              <span className="grid h-7 w-7 place-items-center rounded-full bg-walshe-teal text-white">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ======================= FOOTER (same deep-teal glass styling as the navbar) =========== */}
      {/* A solid branded teal band (walshe-teal is the same dark green in light + dark), so the white
          wordmark and links always read — regardless of the active theme. */}
      <footer className="relative border-t border-white/10 bg-walshe-teal text-white shadow-[0_-10px_30px_-14px_rgba(0,0,0,0.5)]">
        <div className="mx-auto max-w-content px-7 py-16 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[auto_1fr_auto] lg:items-start lg:gap-16">
            {/* Wordmark */}
            <Link href="/" className="justify-self-center lg:justify-self-start" aria-label="The Walshe Group — home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/walshe-group-white.png" alt="The Walshe Group" className="h-28 w-auto sm:h-32" />
            </Link>

            {/* Link columns */}
            <div className="grid grid-cols-1 gap-10 text-center sm:grid-cols-3 lg:px-8">
              {FOOTER_COLS.map((col) => (
                <nav key={col.head} aria-label={col.head}>
                  <h3 className="text-eyebrow uppercase text-white">{col.head}</h3>
                  <ul className="mt-5 space-y-3.5">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <a href={l.href} className="text-[15px] text-white/75 transition-colors hover:text-white">
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>

            {/* Social */}
            <div className="flex items-center justify-center gap-4 lg:justify-self-end lg:pt-9">
              {SOCIALS.map((s) => (
                <a key={s.label} href={s.href} aria-label={s.label} className="grid h-10 w-10 place-items-center rounded-full text-white transition-colors hover:bg-white/10">
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <div className="mt-14 flex flex-col items-center gap-3 border-t border-white/15 pt-8 text-small text-white/70 sm:flex-row sm:justify-between">
            <p>© 2026 The Walshe Group. Voyago is a Walshe Group product.</p>
            <a href="#" className="transition-colors hover:text-white">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

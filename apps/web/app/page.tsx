import Link from "next/link";
import Reveal from "../components/ui/Reveal";

// Public landing page (AC20) — v2 "vita" direction: editorial, photo-led, amber-on-teal, smooth
// motion. Marketing copy + imagery only; the product itself lives behind /login.

const CHECK = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="#0FA37F" aria-hidden>
    <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
  </svg>
);

const FEATURED = [
  { seed: "galway-harbour", cat: "Event · Galway", title: "Harbour Festival", body: "A week of food, music and sea air on Ireland's west coast.", assets: "12 assets" },
  { seed: "cliffs-moher", cat: "Place · Clare", title: "Cliffs of Moher", body: "The signature view of the Wild Atlantic Way, sunrise to storm.", assets: "20 assets" },
  { seed: "dublin-trade", cat: "Opportunity · Dublin", title: "Trade Showcase", body: "Agent-only offers and airline deals, refreshed each season.", assets: "8 assets" },
];

const STEPS = [
  { n: 1, t: "Browse", b: "Search the approved catalog by destination, season or type." },
  { n: 2, t: "Build", b: "Compose in the studio, or let the AI Builder draft it from the content." },
  { n: 3, t: "Personalise", b: "Add your logo, contact and offers — on-brand, automatically." },
  { n: 4, t: "Publish", b: "Export or schedule to social, then track impressions and clicks." },
];

function Mark({ className = "" }: { className?: string }) {
  return <span className={`grid h-9 w-9 place-items-center rounded-md bg-walshe-amber font-extrabold text-walshe-ink ${className}`}>W</span>;
}

export default function Landing() {
  return (
    <main className="bg-walshe-paper">
      {/* ---------------- HERO ---------------- */}
      <header
        className="relative overflow-hidden rounded-b-2xl text-white"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,20,24,.62) 0%, rgba(7,20,24,.30) 38%, rgba(7,20,24,.74) 100%), url('https://picsum.photos/seed/walshe-hero-coast/1800/1100') center/cover no-repeat",
        }}
      >
        <div className="mx-auto max-w-content px-7">
          <nav className="flex items-center gap-8 py-6">
            <Link href="/" className="flex items-center gap-3 text-[19px] font-extrabold tracking-tight">
              <Mark /> Walshe
            </Link>
            <div className="ml-3 hidden gap-7 md:flex">
              {["For the trade", "Destinations", "How it works", "About"].map((l) => (
                <span key={l} className="cursor-default text-[15px] font-medium text-white/85 transition-colors hover:text-white">{l}</span>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Link href="/login" className="px-2 py-3 text-[15px] font-semibold text-white">Sign in</Link>
              <Link href="/login" className="btn-primary">Get started</Link>
            </div>
          </nav>

          <div className="max-w-[720px] pb-[150px] pt-14">
            <p className="eyebrow">The destination content hub</p>
            <h1 className="mt-4 text-[clamp(40px,6vw,74px)] font-extrabold leading-[1.03] tracking-[-0.02em]">
              Verified destinations, trade-ready in minutes.
            </h1>
            <p className="mt-6 max-w-[54ch] text-[19px] text-white/90">
              Tourism boards publish verified content once. 10,000 travel agents turn it into on-brand
              campaigns — imagery, posts, pamphlets and video — without leaving the hub.
            </p>
            <div className="mt-8 flex flex-wrap gap-3.5">
              <Link href="/login" className="btn-primary">Explore the catalog</Link>
              <Link href="/login" className="inline-flex min-h-12 items-center rounded-pill px-6 py-3 text-small font-semibold text-white ring-1 ring-inset ring-white/55 transition-colors hover:bg-white/10">
                See how it works
              </Link>
            </div>
            <p className="mt-10 text-[14px] font-medium text-white/75">
              Trusted by destination boards across ANZ&nbsp;&nbsp;·&nbsp;&nbsp;50 years in travel
            </p>
          </div>
        </div>
      </header>

      {/* ---------------- STAT CARD ---------------- */}
      <div className="mx-auto max-w-content px-7">
        <Reveal className="relative -mt-24 grid grid-cols-2 overflow-hidden rounded-xl bg-white shadow-soft md:grid-cols-4">
          {[
            ["50 yrs", "in travel, in 2026"],
            ["10,000", "trade agents reached"],
            ["6", "destination markets"],
            ["100%", "brand-verified content"],
          ].map(([k, l], i) => (
            <div key={l} className={`p-7 ${i < 3 ? "md:border-r" : ""} ${i < 2 ? "border-b md:border-b-0" : ""} ${i === 0 ? "border-r" : ""} border-walshe-line`}>
              <div className="text-[38px] font-extrabold tracking-[-0.03em]">
                {k.includes(" ") ? (<>{k.split(" ")[0]} <span className="text-walshe-amber">{k.split(" ")[1]}</span></>) : k}
              </div>
              <div className="mt-1 text-[14.5px] font-medium text-walshe-grey">{l}</div>
            </div>
          ))}
        </Reveal>
      </div>

      {/* ---------------- FEATURED ---------------- */}
      <section className="mx-auto max-w-content px-7 py-24">
        <Reveal className="max-w-[640px]">
          <p className="eyebrow">Verified catalog</p>
          <h2 className="mt-3.5 text-h1">Content the trade can trust.</h2>
          <p className="mt-4 text-[18px] text-walshe-grey">
            Every asset is brand-approved by the destination — no crowd-sourced guesswork, no off-brand surprises.
          </p>
        </Reveal>
        <div className="mt-11 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED.map((f, i) => (
            <Reveal key={f.title} className="card card-hover overflow-hidden" delayMs={i * 90}>
              <div className="group relative aspect-[4/3] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://picsum.photos/seed/${f.seed}/700/560`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <span className="chip-verified absolute left-3.5 top-3.5">{CHECK} Verified</span>
              </div>
              <div className="p-5 pb-6">
                <div className="eyebrow text-[11px]">{f.cat}</div>
                <h3 className="mt-2 text-h3">{f.title}</h3>
                <p className="mt-2 text-small text-walshe-grey">{f.body}</p>
                <div className="mt-4 flex items-center justify-between text-small font-semibold">
                  <span className="text-walshe-grey">{f.assets}</span>
                  <span className="text-walshe-ink">Use content →</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- STEPS ---------------- */}
      <div className="mx-auto max-w-content px-7">
        <div className="rounded-2xl bg-walshe-mist px-7 py-20 sm:px-12">
          <Reveal className="max-w-[640px]">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3.5 text-h1">From verified content to published campaign.</h2>
          </Reveal>
          <div className="mt-11 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delayMs={i * 90}>
                <div className="grid h-11 w-11 place-items-center rounded-md bg-white text-[18px] font-extrabold text-walshe-teal shadow-soft">{s.n}</div>
                <h3 className="mt-5 text-h3">{s.t}</h3>
                <p className="mt-2 text-small text-walshe-grey">{s.b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- PRODUCT PEEK ---------------- */}
      <section className="mx-auto max-w-content px-7 py-24">
        <Reveal className="overflow-hidden rounded-2xl bg-walshe-teal text-white">
          <div className="grid items-center gap-12 p-10 sm:p-14 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <p className="eyebrow">Inside the hub</p>
              <h2 className="mt-3.5 text-h1 text-white">A studio built for the trade.</h2>
              <p className="mt-4 max-w-[46ch] text-[17px] text-white/80">
                Everything an agent needs in one place — the verified catalog, a Canva-style studio, an AI Builder, and a social engagement dashboard.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {[
                  "AI Builder drafts posts, pamphlets and video from the catalog",
                  "Personalise with your own branding in one click",
                  "Schedule, publish and measure — all in the hub",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 font-medium text-white/90">
                    <svg className="mt-1 flex-none" width="18" height="18" viewBox="0 0 24 24" fill="#FBA13A" aria-hidden><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg>
                    {t}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="btn-on-dark mt-7">Open the studio</Link>
            </div>
            <div className="rounded-lg border border-white/10 bg-walshe-teal-700 p-4 shadow-lift">
              <div className="flex items-center gap-2 px-1.5 pb-3.5 pt-1">
                {[0, 1, 2].map((i) => <i key={i} className="h-2.5 w-2.5 rounded-full bg-white/25" />)}
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <div className="flex flex-col gap-2 rounded-md bg-white/5 p-3">
                  <div className="h-7 rounded-sm bg-walshe-amber/95" />
                  {[0, 1, 2].map((i) => <div key={i} className="h-7 rounded-sm bg-white/[0.06]" />)}
                </div>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-3 gap-3">
                    {[["5", "Approved"], ["1,200", "Impressions"], ["7.0%", "CTR"]].map(([k, l]) => (
                      <div key={l} className="rounded-md bg-white/5 p-3.5">
                        <b className="text-[22px] font-extrabold">{k}</b>
                        <span className="mt-1 block text-[11px] text-white/55">{l}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {["peek-a", "peek-b"].map((s) => (
                      <div key={s} className="aspect-[16/9] overflow-hidden rounded-md">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://picsum.photos/seed/${s}/400/240`} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------------- CTA ---------------- */}
      <div className="mx-auto max-w-content px-7">
        <Reveal className="py-24 text-center">
          <p className="eyebrow">Ready when you are</p>
          <h2 className="mt-3.5 text-[clamp(30px,4vw,50px)] font-extrabold tracking-[-0.02em]">Put verified destination content to work.</h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[18px] text-walshe-grey">
            Join the trade network already building on-brand campaigns in minutes.
          </p>
          <div className="mt-8 flex justify-center gap-3.5">
            <Link href="/login" className="btn-primary">Get started</Link>
            <Link href="/login" className="btn-secondary">Talk to us</Link>
          </div>
        </Reveal>
      </div>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="bg-walshe-ink py-12 text-white/70">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-4 px-7">
          <div className="flex items-center gap-2.5 font-extrabold text-white"><Mark className="h-8 w-8 rounded-sm text-[15px]" /> Walshe Content Hub</div>
          <span className="ml-auto text-[14px]">Destination marketing &amp; regenerative tourism · 50 years in 2026</span>
        </div>
      </footer>
    </main>
  );
}

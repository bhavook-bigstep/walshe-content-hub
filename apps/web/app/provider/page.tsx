"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CatalogThumb from "../../components/catalog/CatalogThumb";
import StatTile from "../../components/ui/StatTile";
import {
  getPerformance,
  listMyEntries,
  type Entry,
  type Performance,
} from "../../lib/api";

const VIS = [
  { key: "public", label: "Public", blurb: "Visible to every agent", dot: "bg-walshe-teal" },
  { key: "private", label: "Private", blurb: "Invited agents only", dot: "bg-walshe-warn" },
  { key: "draft", label: "Drafts", blurb: "Hidden until published", dot: "bg-walshe-grey" },
] as const;

const QUICK_LINKS = [
  { href: "/provider/performance", title: "Performance", body: "Reach, engagement & trends" },
  { href: "/provider/organization", title: "Organization", body: "Board profile, agents & team" },
  { href: "/provider/blocklist", title: "Brand safety", body: "Off-limits terms" },
];

export default function ProviderHomePage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [perf, setPerf] = useState<Performance | null>(null);

  useEffect(() => {
    listMyEntries().then(setEntries).catch(() => setEntries([]));
    getPerformance().then(setPerf).catch(() => setPerf(null));
  }, []);

  const loading = entries === null;
  const list = entries ?? [];
  const total = list.length;
  const items = list.reduce((t, e) => t + (e.items?.length ?? 0), 0);
  const count = (v: string) => list.filter((e) => (e.visibility ?? "draft") === v).length;

  return (
    <div className="space-y-8 pb-10">
      {/* KPIs */}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))
        ) : (
          <>
            <StatTile label="Catalog entries" value={total} caption={`${items} content items`} />
            <StatTile label="Total reach" value={(perf?.total_reach ?? 0).toLocaleString()} caption="Impressions from agent posts" />
            <StatTile label="Engagements" value={(perf?.total_engagements ?? 0).toLocaleString()} caption="Likes, comments, saves & shares" />
            <StatTile label="Public entries" value={count("public")} caption={`${count("private")} private · ${count("draft")} drafts`} />
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        {/* Recent entries */}
        <section aria-labelledby="recent-entries" className="rounded-xl border border-walshe-line bg-walshe-mist/40 p-5 sm:p-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 id="recent-entries" className="text-h3 text-walshe-ink">Recent entries</h2>
            <Link href="/provider/catalog" className="btn-ghost shrink-0">Open catalog</Link>
          </div>
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card h-56 animate-pulse bg-walshe-stone/60" aria-hidden />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="card flex flex-col items-start gap-3 p-10 text-center sm:items-center">
              <h3 className="text-h3 text-walshe-ink">No entries yet</h3>
              <p className="max-w-md text-body text-walshe-grey">
                Open your catalog to add your first event, place, offer or itinerary.
              </p>
              <Link href="/provider/catalog" className="btn-primary mt-1">Open catalog</Link>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2">
              {list.slice(0, 4).map((e) => (
                <li key={e.id}>
                  <Link href={`/provider/catalog/${e.id}`} className="card card-hover group block overflow-hidden">
                    <div className="relative overflow-hidden">
                      <CatalogThumb imageKey={e.cover_object_key || e.asset_keys?.[0]} alt={e.title} className="h-40 w-full transition-transform duration-500 group-hover:scale-105" />
                      <span className="absolute left-3 top-3 rounded-pill bg-walshe-ink/75 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-white">
                        {e.visibility ?? "draft"}
                      </span>
                    </div>
                    <div className="space-y-1.5 p-5">
                      <h3 className="truncate text-[1.0625rem] font-medium text-walshe-ink">{e.title}</h3>
                      <p className="text-small capitalize text-walshe-grey">{e.type} · {e.destination}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right rail: catalog mix + quick links */}
        <aside className="space-y-6">
          <section className="rounded-xl border border-walshe-line bg-walshe-mist/40 p-6" aria-label="Catalog mix">
            <h2 className="text-h3 text-walshe-ink">Catalog mix</h2>
            <p className="mt-1 text-small text-walshe-grey">How your {total} entries are shared.</p>
            <ul className="mt-4 space-y-3">
              {VIS.map((v) => (
                <li key={v.key} className="flex items-center gap-3">
                  <span aria-hidden className={`h-2.5 w-2.5 flex-none rounded-full ${v.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-medium text-walshe-ink">{v.label}</span>
                    <span className="block text-[12px] text-walshe-grey">{v.blurb}</span>
                  </span>
                  <span className="text-h3 font-bold tabular-nums text-walshe-ink">{loading ? "—" : count(v.key)}</span>
                </li>
              ))}
            </ul>
          </section>

          <nav className="divide-y divide-walshe-line rounded-xl border border-walshe-line bg-walshe-mist/40 p-2" aria-label="Quick links">
            {QUICK_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-md px-4 py-3 transition-colors hover:bg-walshe-ink/5">
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold text-walshe-ink">{l.title}</span>
                  <span className="block text-[12px] text-walshe-grey">{l.body}</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-walshe-grey" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
              </Link>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}

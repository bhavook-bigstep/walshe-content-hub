"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CatalogThumb from "../../components/catalog/CatalogThumb";
import PageHeader from "../../components/ui/PageHeader";
import StatTile from "../../components/ui/StatTile";
import type { Entry } from "../../lib/api";
import { listEntries } from "../../lib/provider-store";

export default function ProviderHomePage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    setEntries(listEntries());
  }, []);

  const loading = entries === null;
  const total = entries?.length ?? 0;
  const brandSafe = entries?.filter((e) => e.brand_safe).length ?? 0;
  const pending = total - brandSafe;
  const assets = entries?.reduce((t, e) => t + (e.asset_keys?.length ?? 0), 0) ?? 0;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/provider" }, { label: "Overview" }]}
        title="Provider home"
        description="Publish verified destination content and control who may use it."
        action={
          <Link href="/provider/catalog/new" className="btn-primary">
            New entry
          </Link>
        }
      />

      <section aria-label="Key figures" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))
        ) : (
          <>
            <StatTile label="Catalog entries" value={total} caption="On this device" />
            <StatTile label="Brand-safe" value={brandSafe} caption="Approved for the trade" />
            <StatTile label="Pending verification" value={pending} caption="Not yet brand-safe" />
            <StatTile label="Uploaded assets" value={assets} caption="Images across entries" />
          </>
        )}
      </section>

      <section aria-labelledby="recent-entries">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recent-entries" className="text-h3 font-bold text-walshe-ink">
            Recent entries
          </h2>
          <Link href="/provider/catalog" className="btn-ghost">
            My catalog
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card h-56 animate-pulse bg-walshe-stone/60" aria-hidden />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="card flex flex-col items-start gap-3 p-8">
            <h3 className="text-h3 font-bold text-walshe-ink">No entries yet</h3>
            <p className="max-w-md text-body text-walshe-grey">
              Create your first event, place, offer or itinerary to start building your verified catalog.
            </p>
            <Link href="/provider/catalog/new" className="btn-primary">
              Create an entry
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entries!.slice(0, 6).map((e) => (
              <li key={e.id} className="card card-hover overflow-hidden">
                <CatalogThumb imageKey={e.asset_keys?.[0]} alt={e.title} className="h-36 w-full" />
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate font-medium text-walshe-ink">{e.title}</h3>
                    <span className={e.brand_safe ? "chip-verified shrink-0" : "chip-draft shrink-0"}>
                      {e.brand_safe ? "Brand-safe" : "Draft"}
                    </span>
                  </div>
                  <p className="text-small capitalize text-walshe-grey">
                    {e.type} · {e.destination}
                  </p>
                  <Link href={`/provider/catalog/${e.id}`} className="inline-block text-small font-medium text-walshe-teal hover:underline">
                    Manage access
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

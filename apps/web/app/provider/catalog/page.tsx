"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CatalogThumb from "../../../components/catalog/CatalogThumb";
import PageHeader from "../../../components/ui/PageHeader";
import type { Entry } from "../../../lib/api";
import { listEntries } from "../../../lib/provider-store";

export default function ProviderCatalogPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    setEntries(listEntries());
  }, []);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/provider" }, { label: "My catalog" }]}
        title="My catalog"
        description="Your published entries, their brand-safe status and access."
        action={
          <Link href="/provider/catalog/new" className="btn-primary">
            New entry
          </Link>
        }
      />

      {entries === null ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="card h-56 animate-pulse bg-walshe-stone/60" />
          ))}
        </ul>
      ) : entries.length === 0 ? (
        <div className="card flex flex-col items-start gap-3 p-8">
          <h2 className="text-h3 font-bold text-walshe-ink">No entries yet</h2>
          <p className="max-w-md text-body text-walshe-grey">
            Create your first entry to start building your verified catalog.
          </p>
          <Link href="/provider/catalog/new" className="btn-primary">
            Create an entry
          </Link>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((e) => (
            <li key={e.id} className="card card-hover flex flex-col overflow-hidden">
              <CatalogThumb imageKey={e.asset_keys?.[0]} alt={e.title} className="h-36 w-full" />
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium text-walshe-ink">{e.title}</h2>
                  <span className={e.brand_safe ? "chip-verified shrink-0" : "chip-draft shrink-0"}>
                    {e.brand_safe ? "Brand-safe" : "Draft"}
                  </span>
                </div>
                <p className="text-small capitalize text-walshe-grey">
                  {e.type} · {e.destination}
                </p>
                <p className="text-small text-walshe-grey">Status: {e.status}</p>
                <Link
                  href={`/provider/catalog/${e.id}`}
                  className="mt-auto inline-block text-small font-medium text-walshe-teal hover:underline"
                >
                  Manage access
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

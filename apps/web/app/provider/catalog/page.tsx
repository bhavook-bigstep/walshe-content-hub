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
        <div className="card flex flex-col items-start gap-3 p-10 text-center sm:items-center">
          <h2 className="text-h3 text-walshe-ink">No entries yet</h2>
          <p className="max-w-md text-body text-walshe-grey">
            Create your first entry to start building your verified catalog.
          </p>
          <Link href="/provider/catalog/new" className="btn-primary mt-1">
            Create an entry
          </Link>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((e) => (
            <li key={e.id} className="card card-hover group flex flex-col overflow-hidden">
              <div className="relative overflow-hidden">
                <CatalogThumb imageKey={e.asset_keys?.[0]} alt={e.title} className="h-40 w-full transition-transform duration-500 group-hover:scale-105" />
                <span className={e.brand_safe ? "chip-verified absolute left-3.5 top-3.5" : "chip-draft absolute left-3.5 top-3.5"}>
                  {e.brand_safe ? "Brand-safe" : "Draft"}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h2 className="text-h3 text-[1.0625rem] text-walshe-ink">{e.title}</h2>
                <p className="text-small capitalize text-walshe-grey">
                  {e.type} · {e.destination}
                </p>
                <p className="text-small text-walshe-grey">
                  Status: <span className="capitalize text-walshe-ink">{e.status}</span>
                </p>
                <Link
                  href={`/provider/catalog/${e.id}`}
                  className="mt-auto inline-flex items-center gap-1 pt-2 text-small font-semibold text-walshe-ink hover:text-walshe-mint"
                >
                  Manage access →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

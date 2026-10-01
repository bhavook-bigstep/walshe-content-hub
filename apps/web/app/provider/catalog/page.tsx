"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Entry } from "../../../lib/api";
import { listEntries } from "../../../lib/provider-store";

export default function ProviderCatalogPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    setEntries(listEntries());
  }, []);

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My catalog</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/provider" className="underline">
            Provider home
          </Link>
          <Link href="/provider/catalog/new" className="rounded bg-slate-900 px-3 py-1 text-white">
            New entry
          </Link>
        </div>
      </div>

      {entries === null && (
        <p role="status" className="text-sm text-slate-600">
          Loading entries...
        </p>
      )}
      {entries && entries.length === 0 && (
        <p className="text-sm text-slate-600">No entries yet. Create your first entry to get started.</p>
      )}
      {entries && entries.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <li key={e.id} className="space-y-2 rounded-lg bg-white p-3 shadow">
              <h2 className="font-medium">{e.title}</h2>
              <p className="text-xs text-slate-500">
                {e.type} · {e.destination}
              </p>
              <p className="text-xs">
                <span className={e.brand_safe ? "text-green-700" : "text-amber-700"}>
                  {e.brand_safe ? "Brand-safe" : "Not brand-safe"}
                </span>{" "}
                · {e.status}
              </p>
              <Link href={`/provider/catalog/${e.id}`} className="text-sm underline">
                Manage access
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

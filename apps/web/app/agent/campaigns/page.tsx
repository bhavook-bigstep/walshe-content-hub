"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import { ApiError, createCampaign, listCampaigns, type Campaign } from "../../../lib/api";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCampaigns()
      .then((c) => setCampaigns(c))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load campaigns."));
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startsOn || !endsOn) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createCampaign({
        name: name.trim(), destination: destination.trim() || null,
        starts_on: startsOn, ends_on: endsOn,
      });
      setCampaigns((prev) => [created, ...(prev ?? [])]);
      setName(""); setDestination(""); setStartsOn(""); setEndsOn("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Campaigns" description="Plan and schedule posts across a date range." />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      <form onSubmit={onCreate} className="card mb-8 flex flex-wrap items-end gap-4 p-6" aria-busy={busy}>
        <label className="flex flex-col gap-1">
          <span className="label">Campaign name</span>
          <input className="field" aria-label="Campaign name" value={name}
                 onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Destination</span>
          <input className="field" aria-label="Destination" value={destination}
                 onChange={(e) => setDestination(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Starts</span>
          <input type="date" className="field" aria-label="Starts on" value={startsOn}
                 onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Ends</span>
          <input type="date" className="field" aria-label="Ends on" value={endsOn}
                 onChange={(e) => setEndsOn(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary h-12" disabled={busy}>
          {busy ? "Creating…" : "Create campaign"}
        </button>
      </form>

      {campaigns === null ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card p-8 text-center text-walshe-grey">No campaigns yet.</div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <li key={c.id} className="card card-hover p-5">
              <Link href={`/agent/campaigns/${c.id}`} className="block">
                <div className="eyebrow text-[11px] capitalize">{c.status} · {c.destination ?? "—"}</div>
                <h3 className="mt-2 text-h3 text-walshe-ink">{c.name}</h3>
                <p className="mt-1 text-small text-walshe-grey">
                  {c.starts_on} → {c.ends_on} · {c.post_count} post{c.post_count === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

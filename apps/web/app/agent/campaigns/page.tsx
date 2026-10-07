"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CampaignsCalendar from "../../../components/campaigns/CampaignsCalendar";
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

      {/* The calendar (right) defines the row height; the left column's content is absolutely
          positioned on lg so it never grows the row — the campaign list scrolls to fit instead. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(340px,1fr)_1.7fr]">
        {/* Left column: create a campaign (fixed) + the list of campaigns (scrolls on lg). */}
        <div className="relative">
          <div className="flex flex-col gap-6 lg:absolute lg:inset-0">
          <form onSubmit={onCreate} className="card space-y-4 p-6 lg:shrink-0" aria-busy={busy}>
            <label className="flex flex-col gap-1.5">
              <span className="label">Campaign name</span>
              <input className="field" aria-label="Campaign name" value={name}
                     onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">Destination</span>
              <input className="field" aria-label="Destination" value={destination}
                     onChange={(e) => setDestination(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="label">Starts</span>
                <input type="date" className="field" aria-label="Starts on" value={startsOn}
                       onChange={(e) => setStartsOn(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">Ends</span>
                <input type="date" className="field" aria-label="Ends on" value={endsOn}
                       onChange={(e) => setEndsOn(e.target.value)} />
              </label>
            </div>
            <button type="submit" className="btn-primary h-12 w-full" disabled={busy}>
              {busy ? "Creating…" : "Create campaign"}
            </button>
          </form>

          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {campaigns === null ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="card h-24 animate-pulse bg-walshe-stone/60" aria-hidden />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="card p-8 text-center text-walshe-grey">No campaigns yet.</div>
            ) : (
              <ul className="space-y-3">
                {campaigns.map((c) => (
                  <li key={c.id} className="card card-hover p-4">
                    <Link href={`/agent/campaigns/${c.id}`} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-body font-semibold text-walshe-ink">{c.name}</h3>
                        <p className="mt-0.5 truncate text-small text-walshe-grey">
                          {c.destination ?? "—"} · {c.starts_on} → {c.ends_on} · {c.post_count} post{c.post_count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="eyebrow shrink-0 text-[11px] capitalize">{c.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </div>
        </div>

        {/* Right column: the campaigns calendar defines the row height (the left column scrolls to
            match it). Always rendered — an empty calendar is still the planning surface. */}
        <div>
          <CampaignsCalendar campaigns={campaigns ?? []} />
        </div>
      </div>
    </div>
  );
}

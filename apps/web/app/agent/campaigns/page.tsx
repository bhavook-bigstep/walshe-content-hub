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

      <div className="grid gap-6 lg:grid-cols-[minmax(340px,1fr)_1.7fr] lg:items-start">
        {/* Left column: create a campaign + the list of campaigns. */}
        <div className="space-y-6">
          <form onSubmit={onCreate} className="card space-y-4 p-6" aria-busy={busy}>
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

          {campaigns === null ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="card h-24 animate-pulse bg-walshe-stone/60" aria-hidden />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="card p-8 text-center text-walshe-grey">No campaigns yet.</div>
          ) : (
            <ul className="space-y-4">
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

        {/* Right column: the campaigns calendar (sticky so it stays in view while the list scrolls). */}
        <div className="lg:sticky lg:top-6">
          {campaigns && campaigns.length > 0 ? (
            <CampaignsCalendar campaigns={campaigns} />
          ) : (
            <div className="card grid min-h-80 place-items-center p-8 text-center text-walshe-grey">
              Your campaigns will appear here on a calendar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

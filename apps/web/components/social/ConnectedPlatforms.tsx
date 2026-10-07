"use client";

import { useEffect, useState } from "react";
import { mergeConnections, SOCIAL_PLATFORMS } from "../../lib/social/platforms";
import PlatformIcon from "./PlatformIcon";

// The "Connected platforms" tab. A PoC front-end illusion: no OAuth/back-end yet — Connect just flips
// the card to Connected. State is remembered per-browser, keyed by the organization, so everyone in
// the org sees the same connections on this device (a stand-in for the real org-shared integration).
export default function ConnectedPlatforms({ orgKey }: { orgKey: string }) {
  const storageKey = `walshe:social-connections:${orgKey}`;
  // Server + first client render use the defaults (Instagram connected) to avoid a hydration
  // mismatch; the stored map is merged in after mount.
  const [connected, setConnected] = useState<Record<string, boolean>>(() => mergeConnections(null));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setConnected(mergeConnections(raw ? (JSON.parse(raw) as Record<string, boolean>) : null));
    } catch {
      /* private mode / blocked storage — keep the defaults */
    }
  }, [storageKey]);

  function setPlatform(key: string, on: boolean) {
    const next = { ...connected, [key]: on };
    setConnected(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore — the UI still reflects the change for this session */
    }
  }

  return (
    <section aria-label="Connected platforms">
      <div className="mb-5 max-w-2xl">
        <h2 className="text-h3 font-bold text-walshe-ink">Connected platforms</h2>
        <p className="mt-1 text-small text-walshe-grey">
          Connect the accounts your organization posts from. Connections are shared across everyone in
          your organization. <span className="text-walshe-grey/80">(Demo — no account is contacted.)</span>
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="connected-platforms">
        {SOCIAL_PLATFORMS.map((p) => {
          const isOn = !!connected[p.key];
          return (
            <li
              key={p.key}
              className="card flex flex-col gap-4 p-5"
              data-testid={`platform-${p.key}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PlatformIcon platform={p.key} name={p.name} />
                  <div className="min-w-0">
                    <p className="font-semibold text-walshe-ink">{p.name}</p>
                    <p className="truncate text-small text-walshe-grey">{p.blurb}</p>
                  </div>
                </div>
                {isOn && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 chip-verified"
                    data-testid={`status-${p.key}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    Connected
                  </span>
                )}
              </div>

              {isOn ? (
                <button
                  type="button"
                  className="btn-ghost h-10 self-start text-walshe-grey"
                  onClick={() => setPlatform(p.key, false)}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary h-10 self-start"
                  onClick={() => setPlatform(p.key, true)}
                  data-testid={`connect-${p.key}`}
                >
                  Connect
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

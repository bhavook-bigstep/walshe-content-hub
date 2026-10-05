"use client";

import { useEffect, useState, type ReactNode } from "react";
import AppShell from "../../components/shell/AppShell";
import HoldingScreen from "../../components/provider/HoldingScreen";
import { me } from "../../lib/api";

// Provider workspace gate (AC25): a pending (unapproved) provider gets the holding screen; an
// approved provider gets the full workspace. Role access itself is enforced by middleware + API.
export default function ProviderLayout({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "approved" | "pending">("loading");

  useEffect(() => {
    let alive = true;
    me()
      .then((u) => alive && setState(u.approved ? "approved" : "pending"))
      .catch(() => alive && setState("pending"));
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="grid h-screen place-items-center bg-walshe-mist text-small text-walshe-grey">Loading…</div>
    );
  }
  if (state === "pending") return <HoldingScreen />;
  return <AppShell role="content_provider">{children}</AppShell>;
}

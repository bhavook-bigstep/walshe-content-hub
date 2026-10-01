"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, login, me } from "../../lib/api";
import { ROLE_HOME } from "../../lib/rbac";
import { clear, setSession, setToken } from "../../lib/session";

// Auth-screen lockup — The Walshe Group wordmark (white) above the product descriptor.
function AuthMark({ tone = "ink" }: { tone?: "ink" | "light" }) {
  const sub = tone === "light" ? "text-white/70" : "text-walshe-grey";
  return (
    <span className="inline-flex flex-col gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/img/walshe-group-white.png" alt="The Walshe Group" className="h-12 w-auto" />
      <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${sub}`}>Content Hub</span>
    </span>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token = await login(email, password);
      setToken(token);
      const user = await me();
      setSession(token, user.role);
      window.location.assign(ROLE_HOME[user.role]);
    } catch (err) {
      clear();
      setError(
        err instanceof ApiError && err.status === 401
          ? "Invalid email or password."
          : err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-walshe-mist lg:grid-cols-[1.05fr_1fr]">
      {/* Photographic brand panel (wide screens only) */}
      <aside
        className="relative hidden overflow-hidden lg:block"
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://picsum.photos/seed/walshe-login-coast/1200/1400"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(165deg, rgba(7,20,24,.55) 0%, rgba(13,46,55,.52) 42%, rgba(7,20,24,.88) 100%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link href="/" className="w-fit">
            <AuthMark tone="light" />
          </Link>
          <div className="max-w-[30ch]">
            <p className="eyebrow">Premium brands, trusted outcomes</p>
            <h2 className="mt-4 text-h1 text-white">
              Verified destination content, trade-ready in minutes.
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-white/80">
              Tourism boards publish once. 10,000 travel agents turn it into on-brand campaigns — without
              leaving the hub.
            </p>
          </div>
          <p className="text-small font-medium text-white/65">Celebrating 50 years in business in 2026</p>
        </div>
      </aside>

      {/* Form */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <AuthMark />
          </Link>

          <div className="mb-7">
            <p className="eyebrow">Welcome back</p>
            <h1 className="mt-3 text-h2 text-walshe-ink">Sign in</h1>
            <p className="mt-2 text-body text-walshe-grey">Access the Walshe Content Hub.</p>
          </div>

          <form onSubmit={onSubmit} className="card space-y-5 p-7" aria-busy={busy}>
            <label className="block">
              <span className="label">Email</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
              />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
              />
            </label>
            {error && (
              <p role="alert" className="text-small font-medium text-walshe-danger">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-small text-walshe-grey">
            Trusted by destination boards across ANZ · 50 years in travel
          </p>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import WalsheLogo from "../../components/brand/WalsheLogo";
import { ApiError, login, me } from "../../lib/api";
import { ROLE_HOME } from "../../lib/rbac";
import { clear, setSession, setToken } from "../../lib/session";

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
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="hidden flex-col justify-between bg-walshe-teal p-10 text-walshe-mint lg:flex">
        <Link href="/">
          <WalsheLogo tone="teal" />
        </Link>
        <div>
          <p className="mb-3 text-small font-medium uppercase tracking-[0.14em] text-walshe-mint/80">
            Premium brands, trusted outcomes
          </p>
          <h2 className="text-h1 font-light text-walshe-white">
            Verified destination content, assembled into trade marketing in minutes.
          </h2>
        </div>
        <p className="text-small text-walshe-mint/70">Celebrating 50 years in business in 2026</p>
      </aside>

      {/* Form */}
      <div className="flex items-center justify-center bg-walshe-stone p-6">
        <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-5 p-8" aria-busy={busy}>
          <div className="lg:hidden">
            <WalsheLogo tone="light" />
          </div>
          <div>
            <h1 className="text-h2 font-light text-walshe-ink">Sign in</h1>
            <p className="mt-1 text-small text-walshe-grey">Access the Walshe Content Hub.</p>
          </div>
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
            <p role="alert" className="text-small text-walshe-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

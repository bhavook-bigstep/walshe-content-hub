"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, me, register } from "../../lib/api";
import { ROLE_HOME } from "../../lib/rbac";
import { clear, setSession, setToken } from "../../lib/session";

// Public self-registration (AC24a) — always creates a Tourism Agent, then signs in. Content
// Providers are provisioned by a Super Admin (AC24b), so this screen offers the agent path only.
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

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const token = await register(email, password);
      setToken(token);
      const user = await me();
      setSession(token, user.role);
      window.location.assign(ROLE_HOME[user.role]);
    } catch (err) {
      clear();
      setError(
        err instanceof ApiError && err.status === 409
          ? "An account with this email already exists. Try signing in."
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
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://picsum.photos/seed/walshe-register-coast/1200/1400"
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
            <p className="eyebrow">For the trade</p>
            <h2 className="mt-4 text-h1 text-white">Turn verified content into campaigns.</h2>
            <p className="mt-5 text-[17px] leading-relaxed text-white/80">
              Create a free agent account to browse the verified catalog and build on-brand marketing
              in the Design Studio.
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
            <p className="eyebrow">Create your account</p>
            <h1 className="mt-3 text-h2 text-walshe-ink">Join as an agent</h1>
            <p className="mt-2 text-body text-walshe-grey">
              Tourism boards are added by the Walshe team — agents sign up here.
            </p>
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
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
              />
            </label>
            <p className="-mt-2.5 text-small text-walshe-grey">At least 8 characters.</p>
            <label className="block">
              <span className="label">Confirm password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="field"
              />
            </label>
            {error && (
              <p role="alert" className="text-small font-medium text-walshe-danger">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-small text-walshe-grey">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-walshe-teal underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

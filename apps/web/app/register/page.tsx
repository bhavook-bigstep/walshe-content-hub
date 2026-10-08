"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, me, register, registerProvider } from "../../lib/api";
import { ROLE_HOME } from "../../lib/rbac";
import { clear, setSession, setToken } from "../../lib/session";

// Role-based registration (AC25): first choose a path. A Tourism Agent is created and signed in
// immediately; a Content Provider self-registers into a pending queue and lands on a holding screen.
type Step = "choose" | "agent" | "provider";

// Auth-screen lockup — the Voyago wordmark above the parent-company descriptor.
function AuthMark({ tone = "ink" }: { tone?: "ink" | "light" }) {
  const sub = tone === "light" ? "text-white/75" : "text-walshe-grey";
  return (
    <span className="inline-flex flex-col items-start gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/voyago-wordmark-white.png"
        alt="Voyago"
        className={`h-16 w-auto shrink-0 ${tone === "light" ? "drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]" : ""}`}
      />
      <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${sub}`}>A Walshe Group product</span>
    </span>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return "An account with this email already exists. Try signing in.";
  }
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [organization, setOrganization] = useState("");
  const [contactName, setContactName] = useState("");
  const [markets, setMarkets] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validatePasswords(): boolean {
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return false;
    }
    if (password !== confirm) {
      setError("Those passwords don’t match.");
      return false;
    }
    return true;
  }

  async function finishSignIn(token: string, fallback: string) {
    setToken(token);
    const user = await me();
    setSession(token, user.role);
    window.location.assign(fallback || ROLE_HOME[user.role]);
  }

  async function onAgentSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validatePasswords()) return;
    setBusy(true);
    try {
      await finishSignIn(await register(email, password), ROLE_HOME.tourism_agent);
    } catch (err) {
      clear();
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function onProviderSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validatePasswords()) return;
    setBusy(true);
    try {
      const token = await registerProvider({
        email,
        password,
        organization,
        contact_name: contactName || null,
        markets: markets
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      });
      // Provider is pending → land on the holding screen at /provider.
      await finishSignIn(token, "/provider");
    } catch (err) {
      clear();
      setError(errorMessage(err));
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
            <p className="eyebrow">Join the hub</p>
            <h2 className="mt-4 text-h1 text-white">One verified catalog. Two ways in.</h2>
            <p className="mt-5 text-[17px] leading-relaxed text-white/80">
              Travel agents build on-brand marketing from verified content. Tourism boards publish that
              content to the trade. Choose your path to get started.
            </p>
          </div>
          <p className="text-small font-medium text-white/65">Celebrating 50 years in business in 2026</p>
        </div>
      </aside>

      {/* Right column */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <AuthMark />
          </Link>

          {step === "choose" && (
            <>
              <Link
                href="/login"
                className="mb-5 inline-flex items-center gap-1.5 text-small font-medium text-walshe-grey transition-colors hover:text-walshe-ink"
              >
                <span aria-hidden>←</span> Back
              </Link>
              <div className="mb-7">
                <p className="eyebrow">Create your account</p>
                <h1 className="mt-3 text-h2 text-walshe-ink">How will you use Voyago?</h1>
                <p className="mt-2 text-body text-walshe-grey">Pick the option that describes you.</p>
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep("agent");
                  }}
                  className="card card-hover block w-full p-5 text-left"
                >
                  <p className="text-[17px] font-semibold text-walshe-ink">I’m a travel agent</p>
                  <p className="mt-1 text-small text-walshe-grey">
                    Browse verified content and build marketing. Instant access.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep("provider");
                  }}
                  className="card card-hover block w-full p-5 text-left"
                >
                  <p className="text-[17px] font-semibold text-walshe-ink">I’m a tourism board / content provider</p>
                  <p className="mt-1 text-small text-walshe-grey">
                    Publish verified content. Our team reviews and onboards you.
                  </p>
                </button>
              </div>
              <p className="mt-6 text-center text-small text-walshe-grey">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-walshe-teal underline-offset-2 hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}

          {step === "agent" && (
            <>
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="mb-5 text-small font-medium text-walshe-grey transition-colors hover:text-walshe-ink"
              >
                ← Back
              </button>
              <div className="mb-7">
                <p className="eyebrow">Travel agent</p>
                <h1 className="mt-3 text-h2 text-walshe-ink">Create your account</h1>
                <p className="mt-2 text-body text-walshe-grey">You’ll be signed in right away.</p>
              </div>
              <form onSubmit={onAgentSubmit} className="card space-y-5 p-7" aria-busy={busy}>
                <label className="block">
                  <span className="label">Email</span>
                  <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
                </label>
                <label className="block">
                  <span className="label">Password</span>
                  <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" />
                </label>
                <label className="block">
                  <span className="label">Confirm password</span>
                  <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field" />
                </label>
                {error && <p role="alert" className="text-small font-medium text-walshe-danger">{error}</p>}
                <button type="submit" disabled={busy} className="btn-primary w-full">
                  {busy ? "Creating account…" : "Create account"}
                </button>
              </form>
            </>
          )}

          {step === "provider" && (
            <>
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="mb-5 text-small font-medium text-walshe-grey transition-colors hover:text-walshe-ink"
              >
                ← Back
              </button>
              <div className="mb-7">
                <p className="eyebrow">Tourism board / provider</p>
                <h1 className="mt-3 text-h2 text-walshe-ink">Request access</h1>
                <p className="mt-2 text-body text-walshe-grey">
                  We verify providers before publishing. Our team will be in touch to onboard you.
                </p>
              </div>
              <form onSubmit={onProviderSubmit} className="card space-y-5 p-7" aria-busy={busy}>
                <label className="block">
                  <span className="label">Organization</span>
                  <input type="text" required value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="e.g. Tourism Ireland" className="field" />
                </label>
                <label className="block">
                  <span className="label">Your name</span>
                  <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className="field" />
                </label>
                <label className="block">
                  <span className="label">Markets</span>
                  <input type="text" value={markets} onChange={(e) => setMarkets(e.target.value)} placeholder="Ireland, Australia" className="field" />
                </label>
                <label className="block">
                  <span className="label">Email</span>
                  <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
                </label>
                <label className="block">
                  <span className="label">Password</span>
                  <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" />
                </label>
                <label className="block">
                  <span className="label">Confirm password</span>
                  <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field" />
                </label>
                {error && <p role="alert" className="text-small font-medium text-walshe-danger">{error}</p>}
                <button type="submit" disabled={busy} className="btn-primary w-full">
                  {busy ? "Submitting…" : "Request access"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

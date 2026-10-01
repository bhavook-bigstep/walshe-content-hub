"use client";

import { useState, type FormEvent } from "react";
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
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
        aria-busy={busy}
      >
        <h1 className="text-xl font-semibold">Walsh Content Hub</h1>
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

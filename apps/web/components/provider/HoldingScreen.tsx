"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clear } from "../../lib/session";

// Shown to a Content Provider whose account is still pending Super-Admin approval (AC25). No
// workspace access until verified. Fits the viewport (AC26) — no page scroll.
export default function HoldingScreen() {
  const router = useRouter();
  function signOut() {
    clear();
    router.replace("/login");
  }
  return (
    <main className="grid h-screen overflow-hidden bg-walshe-mist px-6">
      <div className="m-auto w-full max-w-lg text-center">
        <Link href="/" className="group mb-10 inline-flex" aria-label="The Walshe Group — home">
          <span
            role="img"
            aria-label="The Walshe Group"
            className="logo-mark h-14 w-[99px] bg-white transition-colors duration-300 group-hover:bg-walshe-gold"
          />
        </Link>
        <span className="chip-draft mx-auto mb-6 inline-flex">Application under review</span>
        <h1 className="font-display text-h2 font-semibold text-walshe-ink">
          Thanks — we’re reviewing your organization.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-body leading-relaxed text-walshe-grey">
          Content providers are verified before they can publish. Our team will be in touch shortly to
          confirm your details and onboard you to the hub. You’ll get full access the moment you’re
          approved.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <a href="mailto:info@walshegroup.com" className="btn-primary">
            Contact the team
          </a>
          <button type="button" onClick={signOut} className="btn-secondary">
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}

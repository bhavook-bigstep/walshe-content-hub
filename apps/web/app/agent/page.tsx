import Link from "next/link";

// Agent home: landing target of the RBAC redirect for tourism agents (AC1).
export default function AgentHomePage() {
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Agent home</h1>
      <p className="text-sm text-slate-600">Browse approved destination content and turn it into marketing assets.</p>
      <ul className="grid max-w-xl gap-3 sm:grid-cols-2">
        <li>
          <Link href="/agent/catalog" className="block rounded-lg bg-white p-4 shadow hover:bg-slate-50">
            <span className="font-medium">Catalog</span>
            <span className="block text-sm text-slate-600">Search approved, brand-safe content</span>
          </Link>
        </li>
        <li>
          <Link href="/agent/studio" className="block rounded-lg bg-white p-4 shadow hover:bg-slate-50">
            <span className="font-medium">Design Studio</span>
            <span className="block text-sm text-slate-600">Compose pamphlets, posts and more</span>
          </Link>
        </li>
      </ul>
    </main>
  );
}

import Link from "next/link";

// Provider home: landing target of the RBAC redirect for content providers (AC1).
export default function ProviderHomePage() {
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Provider home</h1>
      <p className="text-sm text-slate-600">Publish verified destination content and control who may use it.</p>
      <ul className="grid max-w-xl gap-3 sm:grid-cols-2">
        <li>
          <Link href="/provider/catalog" className="block rounded-lg bg-white p-4 shadow hover:bg-slate-50">
            <span className="font-medium">My catalog</span>
            <span className="block text-sm text-slate-600">Entries, brand-safe flag and access</span>
          </Link>
        </li>
        <li>
          <Link href="/provider/catalog/new" className="block rounded-lg bg-white p-4 shadow hover:bg-slate-50">
            <span className="font-medium">New entry</span>
            <span className="block text-sm text-slate-600">Event, place, opportunity, offer or itinerary</span>
          </Link>
        </li>
      </ul>
    </main>
  );
}

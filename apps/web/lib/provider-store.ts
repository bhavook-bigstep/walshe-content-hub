// Single home of the provider-entries local snapshot (one STORE_KEY + one set of guarded
// read/write helpers), imported by every provider/catalog screen so the key and the
// JSON.parse/Array.isArray guard can never drift across copies.
//
// The API has no provider-scoped list route (GET /catalog is agent-only, Contract 1), so the
// provider screens keep the entries this browser created/edited as a local snapshot. This is a
// per-device convenience only; the entries still live server-side.
import type { Entry } from "./api";

export const PROVIDER_STORE_KEY = "walsh.provider.entries";

/** All entries in the local snapshot, or [] when storage is empty/blocked/corrupt. */
export function listEntries(): Entry[] {
  try {
    const raw = globalThis.localStorage?.getItem(PROVIDER_STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    return [];
  }
}

/** The one entry with ``id`` from the local snapshot, or null when absent. */
export function getEntry(id: number): Entry | null {
  return listEntries().find((x) => x.id === id) ?? null;
}

/** Insert or replace ``entry`` by id (newly-created entries land at the front). No-op if blocked. */
export function upsertEntry(entry: Entry): void {
  try {
    const list = listEntries();
    const next = list.some((x) => x.id === entry.id)
      ? list.map((x) => (x.id === entry.id ? entry : x))
      : [entry, ...list];
    globalThis.localStorage?.setItem(PROVIDER_STORE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: entry still exists server-side */
  }
}

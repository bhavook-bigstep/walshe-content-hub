// The social platforms an organization can connect. This is a PoC front-end illusion — there is no
// OAuth/back-end integration yet — so the connection state lives per-browser (keyed by org) and this
// module just owns the catalogue + the default state. Pure (no DOM) so it's unit-testable.

export interface SocialPlatform {
  key: string;
  name: string;
  blurb: string;
}

// Instagram is the one wired end-to-end in the PoC (real publish path), so it starts connected.
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  { key: "instagram", name: "Instagram", blurb: "Photo & reel posts" },
  { key: "facebook", name: "Facebook", blurb: "Pages & scheduled posts" },
  { key: "x", name: "X", blurb: "Short posts & threads" },
  { key: "tiktok", name: "TikTok", blurb: "Short-form video" },
  { key: "youtube", name: "YouTube", blurb: "Videos & Shorts" },
];

/** Platforms connected out of the box (only Instagram, mirroring the seed + real publish path). */
export const DEFAULT_CONNECTED: Readonly<Record<string, boolean>> = { instagram: true };

/** Merge a stored connection map over the defaults, so Instagram stays connected unless explicitly
 *  turned off and unknown/missing platforms read as disconnected. */
export function mergeConnections(stored: Record<string, boolean> | null | undefined): Record<string, boolean> {
  return { ...DEFAULT_CONNECTED, ...(stored ?? {}) };
}

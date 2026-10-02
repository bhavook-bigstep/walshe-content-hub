"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, me, updateProfile, type ProfileUpdateInput, type User } from "../../lib/api";

// Preset avatar colours offered to the user (brand palette).
const SWATCHES = ["#005653", "#C47A2E", "#1C5C56", "#4FCAA0", "#E06A63", "#0E3A35"];

// Derive up-to-two-character initials from a display name, falling back to the email.
function initialsFor(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

// Safely read a boolean preference from the loosely-typed preferences bag.
function readBool(prefs: User["preferences"], key: string): boolean {
  return Boolean(prefs?.[key]);
}

export default function ProfileForm() {
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [avatarColor, setAvatarColor] = useState("#005653");
  const [bio, setBio] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const u = await me();
        if (!active) return;
        setUser(u);
        setDisplayName(u.display_name ?? "");
        setAvatarColor(u.avatar_color || "#005653");
        setBio(u.bio ?? "");
        setReducedMotion(readBool(u.preferences, "reduced_motion"));
      } catch (err) {
        if (!active) return;
        setLoadError(
          err instanceof ApiError ? err.message : "Could not load your profile. Please try again.",
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setError(null);

    // Only send changed fields.
    const body: ProfileUpdateInput = {};
    if (displayName !== (user.display_name ?? "")) body.display_name = displayName;
    if (bio !== (user.bio ?? "")) body.bio = bio;
    if (avatarColor !== user.avatar_color) body.avatar_color = avatarColor;
    if (reducedMotion !== readBool(user.preferences, "reduced_motion")) {
      body.preferences = { ...(user.preferences ?? {}), reduced_motion: reducedMotion };
    }

    try {
      const updated = await updateProfile(body);
      setUser(updated);
      setDisplayName(updated.display_name ?? "");
      setAvatarColor(updated.avatar_color || "#005653");
      setBio(updated.bio ?? "");
      setReducedMotion(readBool(updated.preferences, "reduced_motion"));
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save your profile. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="card p-6 sm:p-7">
        <p role="alert" className="text-small font-medium text-walshe-danger">
          {loadError}
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card p-6 sm:p-7">
        <p className="text-body text-walshe-grey">Loading…</p>
      </div>
    );
  }

  const initials = initialsFor(displayName, user.email);

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6 sm:p-7" aria-busy={saving}>
      <label className="block">
        <span className="label">Display name</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="field"
          placeholder={user.email}
        />
      </label>

      <div className="block">
        <span className="label">Avatar colour</span>
        <div className="mt-2 flex items-center gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
            style={{ backgroundColor: avatarColor }}
            aria-hidden
          >
            {initials}
          </span>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((color) => {
              const selected = color.toLowerCase() === avatarColor.toLowerCase();
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAvatarColor(color)}
                  className={`h-8 w-8 rounded-full transition ${
                    selected ? "ring-2 ring-walshe-mint ring-offset-2 ring-offset-transparent" : ""
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Use avatar colour ${color}`}
                  aria-pressed={selected}
                />
              );
            })}
          </div>
        </div>
      </div>

      <label className="block">
        <span className="label">Bio</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={600}
          className="field-area"
        />
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(e) => setReducedMotion(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="label mb-0">Reduce motion</span>
      </label>

      {error && (
        <p role="alert" className="text-small font-medium text-walshe-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-small font-medium text-walshe-green">
          Profile saved.
        </p>
      )}

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

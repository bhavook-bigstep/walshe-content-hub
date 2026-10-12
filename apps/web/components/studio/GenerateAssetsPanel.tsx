"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchAssetObjectUrl,
  generateLibraryMedia,
  generateSprite,
  type UserAsset,
} from "../../lib/api";

/**
 * Generate Assets — the AI-studio section that creates workspace assets from a text description and
 * STORES them: an animated **sprite** (rendered as a sprite sheet, sliced into frames → your Sprites)
 * or a still **image** (→ your Media library). Generated items are owner-scoped; add them to a scene
 * from the Sprites panel / media drawer. (Generated assets are decorative, not verified catalog
 * content.)
 */
export default function GenerateAssetsPanel({
  onImageGenerated,
}: {
  /** Record generated images on the workspace (reference_content.generated) so they show in the
   *  media drawer, ready to place. Sprites land in the Sprites panel (owner-scoped) on their own. */
  onImageGenerated?: (assets: UserAsset[]) => void;
}) {
  const thumbs = useRef<Map<string, string>>(new Map()); // asset key → blob URL
  const [, force] = useState(0);

  const [spriteConcept, setSpriteConcept] = useState("");
  const [spriteBusy, setSpriteBusy] = useState(false);
  const [sprites, setSprites] = useState<{ id: number; name: string; key: string }[]>([]);
  const [spriteMsg, setSpriteMsg] = useState<string | null>(null);

  const [imagePrompt, setImagePrompt] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [images, setImages] = useState<UserAsset[]>([]);
  const [imageMsg, setImageMsg] = useState<string | null>(null);

  useEffect(() => {
    const cache = thumbs.current;
    return () => {
      for (const u of cache.values()) URL.revokeObjectURL(u);
    };
  }, []);

  async function loadThumb(key: string) {
    if (!key || thumbs.current.has(key)) return;
    try {
      thumbs.current.set(key, await fetchAssetObjectUrl(key));
      force((n) => n + 1);
    } catch {
      /* thumbnail optional */
    }
  }

  async function onGenerateSprite() {
    const concept = spriteConcept.trim();
    if (!concept || spriteBusy) return;
    setSpriteBusy(true);
    setSpriteMsg(null);
    try {
      const res = await generateSprite(concept);
      const key = res.sprite.frame_keys[0] ?? "";
      setSprites((prev) => [{ id: res.sprite.id, name: res.sprite.name, key }, ...prev]);
      setSpriteConcept("");
      setSpriteMsg("Saved to your Sprites — add it from the Sprites panel.");
      void loadThumb(key);
    } catch {
      setSpriteMsg("Could not generate a sprite. Try a simpler description.");
    } finally {
      setSpriteBusy(false);
    }
  }

  async function onGenerateImage() {
    const prompt = imagePrompt.trim();
    if (!prompt || imageBusy) return;
    setImageBusy(true);
    setImageMsg(null);
    try {
      const made = await generateLibraryMedia(prompt);
      setImages((prev) => [...made, ...prev]);
      setImagePrompt("");
      setImageMsg("Saved to Media — it's now in the media drawer, ready to place.");
      onImageGenerated?.(made); // record on the workspace so it shows in the media drawer
      for (const a of made) void loadThumb(a.object_key);
    } catch {
      setImageMsg("Could not generate an image. Try a simpler description.");
    } finally {
      setImageBusy(false);
    }
  }

  const thumbGrid = (keys: { key: string; label: string }[]) =>
    keys.length > 0 && (
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {keys.map(({ key, label }, i) => (
          <span
            key={`${key}-${i}`}
            title={label}
            className="grid aspect-square w-full place-items-center overflow-hidden rounded-md border border-walshe-line bg-walshe-stone/40 p-1"
          >
            {thumbs.current.get(key) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbs.current.get(key)} alt={label} className="h-full w-full object-contain" draggable={false} />
            ) : (
              <span className="text-[9px] text-walshe-grey">{label.slice(0, 8)}</span>
            )}
          </span>
        ))}
      </div>
    );

  const field = (
    value: string,
    setValue: (v: string) => void,
    onGo: () => void,
    busy: boolean,
    placeholder: string,
    label: string,
  ) => (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onGo();
        }}
        placeholder={placeholder}
        disabled={busy}
        aria-label={label}
        className="h-9 flex-1 rounded-md border border-walshe-line bg-walshe-stone/40 px-2.5 text-small text-walshe-ink placeholder:text-walshe-grey focus:border-walshe-teal focus:outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={onGo}
        disabled={busy || !value.trim()}
        className="btn-primary h-9 shrink-0 px-3 text-small disabled:opacity-60"
      >
        {busy ? "Generating…" : "Generate"}
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-small text-walshe-grey">
        Describe an asset and the studio generates it and saves it to your workspace.
      </p>

      <section className="space-y-1.5">
        <h3 className="text-small font-bold text-walshe-ink">Sprite (animated)</h3>
        {field(
          spriteConcept, setSpriteConcept, () => void onGenerateSprite(), spriteBusy,
          "e.g. a walking fox, side view", "Describe a sprite to generate",
        )}
        {spriteMsg && <p className="text-[11px] leading-snug text-walshe-grey">{spriteMsg}</p>}
        {thumbGrid(sprites.map((s) => ({ key: s.key, label: s.name })))}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-small font-bold text-walshe-ink">Image (still)</h3>
        {field(
          imagePrompt, setImagePrompt, () => void onGenerateImage(), imageBusy,
          "e.g. a sunset over Galway Bay", "Describe an image to generate",
        )}
        {imageMsg && <p className="text-[11px] leading-snug text-walshe-grey">{imageMsg}</p>}
        {thumbGrid(images.map((a) => ({ key: a.object_key, label: a.title || "Image" })))}
      </section>
    </div>
  );
}

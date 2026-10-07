/**
 * Personalize (AC11): inject the agent's own logo, contact details and custom offer onto the
 * active page. Pure + immutable (design in -> new design out) and deterministic: node ids are
 * fixed per role (`brand-logo-p<page>` etc.), never from Date.now()/Math.random(). Re-applying
 * replaces the previous brand nodes rather than stacking duplicates (idempotent).
 * Output is the same serialisable DesignDoc shape the API export consumes (text/image nodes).
 */

import { fontStack } from "./fonts";
import { cloneDesign, type DesignDoc, type DesignNode } from "./ops";

export interface Branding {
  /** the agent's uploaded logo — `src` for display now, `objectKey` so it re-resolves on reload */
  logo?: { src: string; objectKey?: string };
  /** contact details, one line each is rendered as a single text node */
  contact?: { name?: string; email?: string; phone?: string; website?: string };
  /** custom offer copy */
  offer?: { text: string };
}

/** The brand aesthetics applied across a whole design by {@link applyBrandKit}. */
export interface BrandAesthetics extends Branding {
  /** brand primary colour (hex) — used for headings and shape fills */
  primary: string;
  /** brand accent colour (hex) — used to tint scene backgrounds */
  accent: string;
  /** brand heading font key (sans/serif/display/…) */
  headingFont: string;
  /** brand body font key */
  bodyFont: string;
}

const HEADING_MIN_PX = 44; // text at/above this size reads as a heading → brand primary + heading font
const BODY_INK = "#1f2937"; // readable body colour on a light brand surface

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

/** Parse #rgb / #rrggbb → [r,g,b]; returns null for anything else (e.g. a CSS name). */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Mix two hex colours by `t` (0 = a, 1 = b). Falls back to `a` when either can't be parsed. */
export function hexMix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const to2 = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  const [r, g, bl] = [0, 1, 2].map((i) => ca[i] + (cb[i] - ca[i]) * t);
  return `#${to2(r)}${to2(g)}${to2(bl)}`;
}

/**
 * One-click apply of the agent's brand kit across the WHOLE design (AC87): every scene gets a soft
 * brand-accent background, headings take the primary colour + the brand heading font, body text
 * takes a readable ink + the brand body font, and shapes take a brand fill — then the logo and
 * contact block are injected on the first scene. Pure + deterministic (same kit → same design), so
 * it drives both the live canvas and the export identically. Re-applying is idempotent.
 */
export function applyBrandKit(design: DesignDoc, brand: BrandAesthetics): DesignDoc {
  const surface = hexMix(brand.accent, "#ffffff", 0.86); // a light, on-brand page tint
  const headingStack = fontStack(brand.headingFont);
  const bodyStack = fontStack(brand.bodyFont);

  // Inject the logo + contact (+ optional offer) on the first scene, then restyle every scene so
  // the injected text picks up the brand type/colour too.
  let next = applyBranding(design, { logo: brand.logo, contact: brand.contact, offer: brand.offer }, 0);
  next = cloneDesign(next);

  for (const scene of next.scenes) {
    scene.background = surface;
    for (const node of scene.nodes) {
      if (node.type === "text") {
        const isHeading = (node.fontSize ?? 40) >= HEADING_MIN_PX;
        node.color = isHeading ? brand.primary : BODY_INK;
        node.fontFamily = isHeading ? headingStack : bodyStack;
      } else if (node.type === "shape") {
        node.color = brand.accent;
        if (node.stroke) node.stroke = brand.primary;
      } else if (node.type === "background") {
        node.color = surface;
      }
    }
  }
  return next;
}

const MARGIN = 48;
const BRAND_PREFIX = "brand-";

function brandId(role: "logo" | "offer" | "contact", sceneId: string): string {
  return `${BRAND_PREFIX}${role}-${sceneId}`;
}

function contactText(c: NonNullable<Branding["contact"]>): string {
  return [c.name, c.email, c.phone, c.website]
    .map((v) => v?.trim())
    .filter((v): v is string => !!v)
    .join("\n");
}

export function applyBranding(
  design: DesignDoc,
  branding: Branding,
  sceneIndex = 0,
): DesignDoc {
  if (sceneIndex < 0 || sceneIndex >= design.scenes.length) {
    throw new RangeError(`scene index ${sceneIndex} out of range (0..${design.scenes.length - 1})`);
  }
  const { width, height } = design;
  const sceneId = design.scenes[sceneIndex].id;
  const brandNodes: DesignNode[] = [];

  if (branding.logo?.src) {
    brandNodes.push({
      id: brandId("logo", sceneId),
      type: "image",
      x: MARGIN,
      y: MARGIN,
      width: 160,
      height: 160,
      src: branding.logo.src,
      ...(branding.logo.objectKey ? { objectKey: branding.logo.objectKey } : {}),
    });
  }
  const offer = branding.offer?.text.trim();
  if (offer) {
    brandNodes.push({
      id: brandId("offer", sceneId),
      type: "text",
      x: MARGIN,
      y: Math.max(MARGIN, height - 280),
      width: Math.max(1, width - 2 * MARGIN),
      height: 120,
      color: "#b91c1c",
      text: offer,
    });
  }
  const contact = branding.contact ? contactText(branding.contact) : "";
  if (contact) {
    brandNodes.push({
      id: brandId("contact", sceneId),
      type: "text",
      x: MARGIN,
      y: Math.max(MARGIN, height - 140),
      width: Math.max(1, width - 2 * MARGIN),
      height: 96,
      color: "#111111",
      text: contact,
    });
  }

  // Re-applying replaces the previous brand nodes on this scene rather than stacking (idempotent).
  const ids = new Set(brandNodes.map((n) => n.id));
  const next = cloneDesign(design);
  const target = next.scenes[sceneIndex];
  target.nodes = [...target.nodes.filter((n) => !ids.has(n.id)), ...brandNodes];
  return next;
}

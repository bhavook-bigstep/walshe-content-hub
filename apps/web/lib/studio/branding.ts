/**
 * Personalize (AC11): inject the agent's own logo, contact details and custom offer onto the
 * active page. Pure + immutable (design in -> new design out) and deterministic: node ids are
 * fixed per role (`brand-logo-p<page>` etc.), never from Date.now()/Math.random(). Re-applying
 * replaces the previous brand nodes rather than stacking duplicates (idempotent).
 * Output is the same serialisable DesignDoc shape the API export consumes (text/image nodes).
 */

import { fontStack } from "./fonts";
import {
  cloneDesign,
  DEFAULT_SCENE_DURATION_MS,
  type DesignDoc,
  type DesignNode,
  type Scene,
} from "./ops";

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

/** Options controlling what a brand-kit apply touches. */
export interface ApplyBrandOptions {
  /** When false, the template's own colours/fonts are left untouched (only the logo watermark and
   * the contact scene are applied). Defaults to true — the classic one-click recolour. */
  colors?: boolean;
}

/**
 * One-click apply of the agent's brand kit across the WHOLE design (AC87): a small logo watermark is
 * placed on every scene, and a designed "Contact" scene (logo, heading, email, website link) is
 * appended as the closing page. When `colors` is on (default) each content scene also gets a soft
 * brand-accent background, brand heading/body fonts and brand fills; when off, the template keeps its
 * own colours so nothing shifts unexpectedly. Pure + deterministic (same kit + options → same
 * design), so it drives the live canvas and the export identically. Re-applying is idempotent — the
 * watermarks and the closing scene are replaced, never stacked.
 */
export function applyBrandKit(
  design: DesignDoc,
  brand: BrandAesthetics,
  options: ApplyBrandOptions = {},
): DesignDoc {
  const { colors = true } = options;
  const surface = hexMix(brand.accent, "#ffffff", 0.86); // a light, on-brand page tint
  const headingStack = fontStack(brand.headingFont);
  const bodyStack = fontStack(brand.bodyFont);

  const next = cloneDesign(design);
  // Drop any previous closing scene so re-applying refreshes it instead of appending a new one.
  next.scenes = next.scenes.filter((s) => s.id !== BRAND_OUTRO_ID);

  for (const scene of next.scenes) {
    if (colors) {
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
    // A logo watermark on every scene (idempotent: replace the prior one rather than stack).
    const logoId = brandId("logo", scene.id);
    scene.nodes = scene.nodes.filter((n) => n.id !== logoId);
    if (brand.logo?.src) scene.nodes.push(watermarkLogo(logoId, design, brand.logo));
  }

  // Append the designed closing contact scene (always brand-styled — it IS the brand page).
  next.scenes.push(brandOutroScene(design, brand, headingStack, bodyStack));
  return next;
}

const MARGIN = 48;
const BRAND_PREFIX = "brand-";
const BRAND_OUTRO_ID = "brand-outro";

/** A small brand logo placed in a scene's top-right corner as a watermark. */
function watermarkLogo(id: string, design: DesignDoc, logo: NonNullable<Branding["logo"]>): DesignNode {
  const size = Math.round(Math.min(design.width, design.height) * 0.12);
  return {
    id,
    type: "image",
    x: design.width - MARGIN - size,
    y: MARGIN,
    width: size,
    height: size,
    src: logo.src,
    ...(logo.objectKey ? { objectKey: logo.objectKey } : {}),
  };
}

/** Choose a readable text colour (near-black or white) for text sitting on `bg`, by its luminance. */
function readableOn(bg: string): string {
  const c = parseHex(bg);
  if (!c) return "#ffffff";
  const yiq = (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000; // perceived brightness 0..255
  return yiq >= 150 ? "#111827" : "#ffffff";
}

/** Strip the scheme + trailing slash so a website reads as a clean label (still the brand's URL). */
function prettyUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/**
 * The designed closing "Contact" scene: a solid brand-primary card with the logo centred, a heading
 * (the contact name, or "Get in touch"), an accent divider, the email, and the website as a
 * highlighted link. Centred column, readable text chosen from the background's luminance, sized in
 * fractions of the artboard so it works for any format. Stable ids → idempotent.
 */
function brandOutroScene(
  design: DesignDoc,
  brand: BrandAesthetics,
  headingStack: string,
  bodyStack: string,
): Scene {
  const { width, height } = design;
  const bg = brand.primary;
  const onBg = readableOn(bg);
  const dim = hexMix(onBg, bg, 0.25); // a softened version of the readable colour for sub-text
  const mid = Math.min(width, height);
  const margin = Math.round(width * 0.08);
  const colX = margin;
  const colW = width - 2 * margin;
  const center = (w: number) => Math.round((width - w) / 2);
  const nodes: DesignNode[] = [];

  let y = Math.round(height * 0.14);
  if (brand.logo?.src) {
    const size = Math.round(mid * 0.22);
    nodes.push({
      id: "brand-outro-logo",
      type: "image",
      x: center(size),
      y,
      width: size,
      height: size,
      src: brand.logo.src,
      ...(brand.logo.objectKey ? { objectKey: brand.logo.objectKey } : {}),
    });
    y += size + Math.round(height * 0.05);
  } else {
    y = Math.round(height * 0.3);
  }

  const headingText = brand.contact?.name?.trim() || "Get in touch";
  const headingSize = Math.round(mid * 0.072);
  nodes.push({
    id: "brand-outro-heading",
    type: "text",
    x: colX,
    y,
    width: colW,
    height: Math.round(headingSize * 1.4),
    text: headingText,
    color: onBg,
    fontFamily: headingStack,
    fontSize: headingSize,
    fontWeight: "bold",
    textAlign: "center",
  });
  y += Math.round(headingSize * 1.5);

  const ruleW = Math.round(width * 0.12);
  const ruleH = Math.max(3, Math.round(height * 0.006));
  nodes.push({
    id: "brand-outro-rule",
    type: "shape",
    shape: "rect",
    x: center(ruleW),
    y,
    width: ruleW,
    height: ruleH,
    color: brand.accent,
    radius: ruleH,
  });
  y += Math.round(height * 0.055);

  const email = brand.contact?.email?.trim();
  if (email) {
    const sz = Math.round(mid * 0.034);
    nodes.push({
      id: "brand-outro-contact",
      type: "text",
      x: colX,
      y,
      width: colW,
      height: Math.round(sz * 1.6),
      text: email,
      color: dim,
      fontFamily: bodyStack,
      fontSize: sz,
      textAlign: "center",
    });
    y += Math.round(sz * 1.9);
  }

  const site = brand.contact?.website?.trim();
  if (site) {
    const sz = Math.round(mid * 0.04);
    nodes.push({
      id: "brand-outro-website",
      type: "text",
      x: colX,
      y,
      width: colW,
      height: Math.round(sz * 1.6),
      text: prettyUrl(site),
      color: brand.accent,
      fontFamily: bodyStack,
      fontSize: sz,
      fontWeight: "bold",
      textAlign: "center",
    });
  }

  return {
    id: BRAND_OUTRO_ID,
    name: "Contact",
    durationMs: DEFAULT_SCENE_DURATION_MS,
    transition: "fade",
    background: bg,
    nodes,
  };
}

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

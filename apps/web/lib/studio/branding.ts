/**
 * Personalize (AC11): inject the agent's own logo, contact details and custom offer onto the
 * active page. Pure + immutable (design in -> new design out) and deterministic: node ids are
 * fixed per role (`brand-logo-p<page>` etc.), never from Date.now()/Math.random(). Re-applying
 * replaces the previous brand nodes rather than stacking duplicates (idempotent).
 * Output is the same serialisable DesignDoc shape the API export consumes (text/image nodes).
 */

import { cloneDesign, type DesignDoc, type DesignNode } from "./ops";

export interface Branding {
  /** served URL of the agent's uploaded logo (existing agent-scoped assets endpoint) */
  logo?: { src: string };
  /** contact details, one line each is rendered as a single text node */
  contact?: { name?: string; email?: string; phone?: string; website?: string };
  /** custom offer copy */
  offer?: { text: string };
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

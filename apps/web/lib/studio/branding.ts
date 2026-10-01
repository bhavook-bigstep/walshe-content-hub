/**
 * Personalize (AC11): inject the agent's own logo, contact details and custom offer onto the
 * active page. Pure + immutable (design in -> new design out) and deterministic: node ids are
 * fixed per role (`brand-logo-p<page>` etc.), never from Date.now()/Math.random(). Re-applying
 * replaces the previous brand nodes rather than stacking duplicates (idempotent).
 * Output is the same serialisable DesignDoc shape the API export consumes (text/image nodes).
 */

import type { DesignDoc, DesignNode, DesignPage } from "./ops";

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

function brandId(role: "logo" | "offer" | "contact", pageIndex: number): string {
  return `${BRAND_PREFIX}${role}-p${pageIndex}`;
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
  pageIndex = 0,
): DesignDoc {
  if (pageIndex < 0 || pageIndex >= design.pages.length) {
    throw new RangeError(`page index ${pageIndex} out of range (0..${design.pages.length - 1})`);
  }
  const { width, height } = design;
  const brandNodes: DesignNode[] = [];

  if (branding.logo?.src) {
    brandNodes.push({
      id: brandId("logo", pageIndex),
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
      id: brandId("offer", pageIndex),
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
      id: brandId("contact", pageIndex),
      type: "text",
      x: MARGIN,
      y: Math.max(MARGIN, height - 140),
      width: Math.max(1, width - 2 * MARGIN),
      height: 96,
      color: "#111111",
      text: contact,
    });
  }

  const ids = new Set(brandNodes.map((n) => n.id));
  return {
    format: design.format,
    width: design.width,
    height: design.height,
    pages: design.pages.map((p, i): DesignPage => {
      const kept = p.nodes.filter((n) => !(i === pageIndex && ids.has(n.id))).map((n) => ({ ...n }));
      return {
        background: p.background,
        nodes: i === pageIndex ? [...kept, ...brandNodes] : kept,
      };
    }),
  };
}

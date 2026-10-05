import { describe, expect, it } from "vitest";
import { applyBranding } from "../lib/studio/branding";
import { addText, newDesign } from "../lib/studio/ops";

// AC11 — Personalize. Proof node-id: `apps/web/tests/personalize.test.ts::test_apply_branding_adds_nodes`.
const branding = {
  logo: { src: "/assets/agent-1/logo.png" },
  contact: { name: "Aoife Agent", email: "aoife@example.test", phone: "+353 1 000 0000" },
  offer: { text: "Spring special: 10% off" },
};

describe("applyBranding", () => {
  it("test_apply_branding_adds_nodes", () => {
    const base = addText(newDesign("social"), 0, "Discover Galway");
    const snapshot = JSON.stringify(base);
    const out = applyBranding(base, branding);

    expect(JSON.stringify(base)).toBe(snapshot); // immutable
    const nodes = out.scenes[0].nodes;
    expect(nodes).toHaveLength(4);
    expect(nodes.find((n) => n.type === "image")).toMatchObject({ src: "/assets/agent-1/logo.png" });
    expect(nodes.find((n) => n.text?.includes("aoife@example.test"))).toBeDefined();
    expect(nodes.find((n) => n.text === "Spring special: 10% off")).toBeDefined();
    expect(new Set(nodes.map((n) => n.id)).size).toBe(4);

    // deterministic + serialisable + idempotent
    expect(JSON.stringify(applyBranding(base, branding))).toBe(JSON.stringify(out));
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    expect(applyBranding(out, branding)).toEqual(out);
  });

  it("skips empty parts and targets the given page only", () => {
    const base = newDesign("pamphlet");
    const out = applyBranding(base, { offer: { text: "  " }, contact: {} }, 1);
    expect(out.scenes.every((p) => p.nodes.length === 0)).toBe(true);
    const two = applyBranding(base, { offer: { text: "Deal" } }, 1);
    expect(two.scenes[0].nodes).toHaveLength(0);
    expect(two.scenes[1].nodes).toHaveLength(1);
    expect(() => applyBranding(base, branding, 99)).toThrow(RangeError);
  });
});

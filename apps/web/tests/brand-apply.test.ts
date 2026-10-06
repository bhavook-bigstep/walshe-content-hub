import { describe, expect, it } from "vitest";
import { applyBrandKit, hexMix, type BrandAesthetics } from "../lib/studio/branding";
import { fontStack } from "../lib/studio/fonts";
import { addShape, addText, newDesign, type DesignDoc } from "../lib/studio/ops";

const BRAND: BrandAesthetics = {
  primary: "#123456",
  accent: "#ffcc00",
  headingFont: "serif",
  bodyFont: "sans",
  contact: { name: "Alex Rivera", email: "alex@example.test" },
};

// A design with a heading (large text), body (small text) and a shape.
function sample(): DesignDoc {
  let d = newDesign("social");
  d = addText(d, 0, "SANTORINI", { fontSize: 84 });
  d = addText(d, 0, "Book your escape", { fontSize: 26 });
  d = addShape(d, 0, "rect", { stroke: "#999999" });
  return d;
}

describe("hexMix", () => {
  it("mixes two hex colours by t", () => {
    expect(hexMix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(hexMix("#ff0000", "#0000ff", 0.5)).toBe("#800080");
    expect(hexMix("#123456", "#ffffff", 0)).toBe("#123456");
  });
  it("falls back to the first colour for an unparseable input", () => {
    expect(hexMix("rebeccapurple", "#fff", 0.5)).toBe("rebeccapurple");
  });
});

describe("applyBrandKit (AC87)", () => {
  it("recolours headings/body/shapes and sets the brand fonts + a tinted background", () => {
    const out = applyBrandKit(sample(), BRAND);
    const scene = out.scenes[0];

    // Background is a light tint of the accent.
    expect(scene.background).toBe(hexMix("#ffcc00", "#ffffff", 0.86));

    const heading = scene.nodes.find((n) => n.text === "SANTORINI")!;
    expect(heading.color).toBe("#123456"); // brand primary
    expect(heading.fontFamily).toBe(fontStack("serif"));

    const body = scene.nodes.find((n) => n.text === "Book your escape")!;
    expect(body.color).toBe("#1f2937"); // readable ink
    expect(body.fontFamily).toBe(fontStack("sans"));

    const shape = scene.nodes.find((n) => n.type === "shape")!;
    expect(shape.color).toBe("#ffcc00"); // brand accent fill
    expect(shape.stroke).toBe("#123456"); // existing stroke recoloured to primary
  });

  it("injects the contact block on the first scene, brand-styled", () => {
    const out = applyBrandKit(sample(), BRAND);
    const contact = out.scenes[0].nodes.find((n) => n.id.startsWith("brand-contact-"))!;
    expect(contact).toBeTruthy();
    expect(contact.text).toContain("Alex Rivera");
    expect(contact.color).toBe("#1f2937"); // picked up the body style in the restyle pass
    expect(contact.fontFamily).toBe(fontStack("sans"));
  });

  it("is deterministic and idempotent (re-applying yields the same design)", () => {
    const once = applyBrandKit(sample(), BRAND);
    expect(applyBrandKit(sample(), BRAND)).toEqual(once); // deterministic
    expect(applyBrandKit(once, BRAND)).toEqual(once); // idempotent (brand nodes replaced, not stacked)
  });
});

import { describe, expect, it } from "vitest";
import { applyBrandKit, hexMix, type BrandAesthetics } from "../lib/studio/branding";
import { fontStack } from "../lib/studio/fonts";
import { addShape, addText, newDesign, type DesignDoc } from "../lib/studio/ops";

const BRAND: BrandAesthetics = {
  primary: "#123456",
  accent: "#ffcc00",
  headingFont: "serif",
  bodyFont: "sans",
  contact: { name: "Alex Rivera", email: "alex@example.test", website: "https://alex.example.test/" },
  logo: { src: "blob:logo", objectKey: "users/1/brand-logo/x" },
};

// A design with a heading (large text), body (small text) and a shape.
function sample(): DesignDoc {
  let d = newDesign("social");
  d = addText(d, 0, "SANTORINI", { fontSize: 84 });
  d = addText(d, 0, "Book your escape", { fontSize: 26 });
  d = addShape(d, 0, "rect", { stroke: "#999999" });
  return d;
}

const contentScenes = (d: DesignDoc) => d.scenes.filter((s) => s.id !== "brand-outro");
const outroOf = (d: DesignDoc) => d.scenes.find((s) => s.id === "brand-outro")!;

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

  it("places a logo watermark on every content scene", () => {
    let d = newDesign("social");
    d = addText(d, 0, "A", { fontSize: 84 });
    d = { ...d, scenes: [...d.scenes, { ...d.scenes[0], id: "scene-n2", name: "Scene 2", nodes: [] }] };
    const out = applyBrandKit(d, BRAND);
    for (const scene of contentScenes(out)) {
      const logo = scene.nodes.find((n) => n.id === `brand-logo-${scene.id}`)!;
      expect(logo).toBeTruthy();
      expect(logo.type).toBe("image");
      expect(logo.src).toBe("blob:logo");
      expect(logo.objectKey).toBe("users/1/brand-logo/x");
    }
  });

  it("appends a designed contact scene with the logo, name heading, email and website link", () => {
    const outro = outroOf(applyBrandKit(sample(), BRAND));
    expect(outro.name).toBe("Contact");
    expect(outro.background).toBe("#123456"); // the brand-primary card
    expect(outro.nodes.find((n) => n.id === "brand-outro-logo")?.src).toBe("blob:logo");
    expect(outro.nodes.find((n) => n.id === "brand-outro-heading")?.text).toBe("Alex Rivera");
    expect(outro.nodes.find((n) => n.id === "brand-outro-contact")?.text).toBe("alex@example.test");
    const site = outro.nodes.find((n) => n.id === "brand-outro-website")!;
    expect(site.text).toBe("alex.example.test"); // scheme + trailing slash stripped
    expect(site.color).toBe("#ffcc00"); // highlighted in the accent
    // Text on the dark primary card is white for contrast.
    expect(outro.nodes.find((n) => n.id === "brand-outro-heading")?.color).toBe("#ffffff");
  });

  it("colors:false leaves the template colours/fonts untouched but still brands the logo + contact", () => {
    const base = sample();
    const out = applyBrandKit(base, BRAND, { colors: false });
    const scene = out.scenes[0];
    // Background and the heading's colour/font are unchanged from the template.
    expect(scene.background).toBe(base.scenes[0].background);
    const heading = scene.nodes.find((n) => n.text === "SANTORINI")!;
    expect(heading.color).toBe(base.scenes[0].nodes.find((n) => n.text === "SANTORINI")!.color);
    expect(heading.fontFamily).toBeUndefined();
    // But the logo watermark and the contact scene are still applied.
    expect(scene.nodes.some((n) => n.id === `brand-logo-${scene.id}`)).toBe(true);
    expect(outroOf(out)).toBeTruthy();
  });

  it("is deterministic and idempotent (re-applying yields the same design)", () => {
    const once = applyBrandKit(sample(), BRAND);
    expect(applyBrandKit(sample(), BRAND)).toEqual(once); // deterministic
    expect(applyBrandKit(once, BRAND)).toEqual(once); // idempotent (watermark + contact scene replaced)
    expect(once.scenes.filter((s) => s.id === "brand-outro")).toHaveLength(1); // not stacked
  });
});

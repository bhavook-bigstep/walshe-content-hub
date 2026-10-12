import { describe, expect, it } from "vitest";
import {
  addCatalogImage,
  addShape,
  addText,
  groupNodes,
  newDesign,
  setBackground,
  setNodeAnim,
  type DesignDoc,
} from "../lib/studio/ops";
import { describeScene, observeDesign, refreshDescriptions } from "../lib/studio/describe";

// The scene-description deriver: a pure, deterministic projection of scene STATE into words, so the
// agent can observe the workspace by reading an accurate description instead of analysing a render.

function single(format: "social" = "social"): DesignDoc {
  const d = newDesign(format);
  // Collapse to one scene for predictable assertions.
  return { ...d, scenes: [d.scenes[0]] };
}

const opts = { width: 1080, height: 1080 } as const;

describe("describeScene", () => {
  it("describes an empty scene as an empty canvas", () => {
    const d = single();
    expect(describeScene(d.scenes[0], opts)).toMatch(/Empty canvas/i);
  });

  it("describes a text node with its copy and position", () => {
    const d = addText(single(), 0, "Discover Galway", { x: 400, y: 40, width: 280, height: 80 });
    const text = describeScene(d.scenes[0], opts);
    expect(text).toContain('"Discover Galway"');
    expect(text).toContain("upper-centre");
    expect(text).toContain("1 element");
  });

  it("names a catalog image by its title when a label is given", () => {
    const d = addCatalogImage(single(), 0, { src: "blob:x", catalogItemId: "7" }, {
      x: 0, y: 540, width: 1080, height: 540,
    });
    const withLabel = describeScene(d.scenes[0], { ...opts, labels: { "7": "Cliffs of Moher" } });
    expect(withLabel).toContain('photo of "Cliffs of Moher"');
    // Without a label it still names the provenance id, never fabricates a title.
    const noLabel = describeScene(d.scenes[0], opts);
    expect(noLabel).toContain("catalog image #7");
  });

  it("describes a shape with its kind and colour, and the background", () => {
    let d = setBackground(single(), 0, "#0e2a26");
    d = addShape(d, 0, "rect", { x: 0, y: 980, width: 1080, height: 100, color: "#ffcc00" });
    const text = describeScene(d.scenes[0], opts);
    expect(text).toContain("Background #0e2a26");
    expect(text).toContain("rect");
    expect(text).toContain("#ffcc00");
  });

  it("describes an entrance animation with its timing", () => {
    let d = addText(single(), 0, "Hi", {});
    const nodeId = d.scenes[0].nodes[0].id;
    d = setNodeAnim(d, 0, nodeId, {
      keyframes: [{ t: 0, opacity: 0 }, { t: 600, opacity: 1 }],
      enter: { type: "fade", startMs: 500, durationMs: 600 },
    });
    expect(describeScene(d.scenes[0], opts)).toMatch(/fades in at 500ms over 600ms/);
  });

  it("is pure and deterministic — same scene yields identical text", () => {
    const d = addText(single(), 0, "Stable", {});
    const a = describeScene(d.scenes[0], opts);
    const b = describeScene(JSON.parse(JSON.stringify(d.scenes[0])), opts);
    expect(a).toBe(b);
  });
});

describe("refreshDescriptions + observeDesign", () => {
  it("stores a fresh description on every scene", () => {
    const d = addText(single(), 0, "Headline", {});
    const refreshed = refreshDescriptions(d);
    expect(refreshed.scenes[0].description).toContain('"Headline"');
    // refresh is a pure copy — the input is untouched.
    expect(d.scenes[0].description).toBeUndefined();
  });

  it("produces a structured observation with per-scene descriptions and element counts", () => {
    let d = addText(single(), 0, "A", {});
    d = addShape(d, 0, "ellipse", {});
    const obs = observeDesign(d);
    expect(obs.sceneCount).toBe(1);
    expect(obs.scenes[0].nodeCount).toBe(2);
    expect(obs.scenes[0].elements).toEqual({ text: 1, shape: 1 });
    expect(obs.scenes[0].description).toContain("2 elements");
  });

  it("exposes per-node handles (id + type + brief) so the agent can target nodes to edit", () => {
    const d = addText(single(), 0, "Edit me", {});
    const handle = observeDesign(d).scenes[0].nodes[0];
    expect(handle.id).toBe(d.scenes[0].nodes[0].id);
    expect(handle.type).toBe("text");
    expect(handle.brief).toContain('"Edit me"');
  });

  it("exposes group handles (id + member count) so the agent can target groups", () => {
    let d = addText(single(), 0, "A", {});
    d = addText(d, 0, "B", {});
    const ids = d.scenes[0].nodes.map((n) => n.id);
    d = groupNodes(d, 0, ids);
    const group = observeDesign(d).scenes[0].groups[0];
    expect(group.id).toBe(d.scenes[0].groups![0].id);
    expect(group.memberCount).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  planDemo,
  runBuilderDemo,
  type DemoController,
  type DemoItem,
  type ScenePoint,
} from "../lib/studio/builder-demo";
import { editText, newDesign, type DesignDoc } from "../lib/studio/ops";

// Synthetic collection items (no real assets) — three with imagery, one text-only.
const ITEMS: DemoItem[] = [
  { id: 1, title: "Cliffs of Moher", destination: "Ireland", imageSrc: "blob:cliffs" },
  { id: 2, title: "Wild Atlantic Way", destination: "Ireland", imageSrc: "blob:waw" },
  { id: 3, title: "Harbour Festival", destination: "Galway", imageSrc: "blob:harbour" },
  { id: 4, title: "Autumn Escapes", destination: "Ireland" },
];

/** A recording controller that applies the real ops to an in-memory design (no DOM, deterministic),
 * so the test exercises the actual build, not a mock of it. */
function recorder() {
  let design: DesignDoc = newDesign("social");
  const thoughts: string[] = [];
  const moves: (ScenePoint | null)[] = [];
  const scenesVisited: number[] = [];
  let played = false;
  let fitted = false;

  const ui: string[] = [];
  const ctrl: DemoController = {
    cancelled: () => false,
    wait: async () => {},
    fit: () => {
      fitted = true;
    },
    think: async (t) => {
      thoughts.push(t);
    },
    moveTo: async (p) => {
      moves.push(p);
    },
    goToScene: async (i) => {
      scenesVisited.push(i);
    },
    cursorTo: async () => {},
    openDrawer: async () => {
      ui.push("openDrawer");
    },
    closeDrawer: async () => {
      ui.push("closeDrawer");
    },
    showCollection: async () => {
      ui.push("showCollection");
    },
    closeAll: () => {
      ui.push("closeAll");
    },
    addNode: async (sceneIndex, mutate) => {
      const before = new Set((design.scenes[sceneIndex]?.nodes ?? []).map((n) => n.id));
      design = mutate(design);
      return design.scenes[sceneIndex]?.nodes.find((n) => !before.has(n.id))?.id ?? null;
    },
    update: async (mutate) => {
      design = mutate(design);
    },
    typeText: async (sceneIndex, nodeId, full) => {
      design = editText(design, sceneIndex, nodeId, full);
    },
    select: async () => {},
    play: async () => {
      played = true;
    },
  };
  return {
    ctrl,
    get design() {
      return design;
    },
    thoughts,
    moves,
    scenesVisited,
    ui,
    get played() {
      return played;
    },
    get fitted() {
      return fitted;
    },
  };
}

describe("planDemo", () => {
  it("picks an image-bearing hero, image-first features (max 3), and a CTA", () => {
    const plan = planDemo(ITEMS)!;
    expect(plan.hero.id).toBe(1); // first item with imagery
    expect(plan.features.map((f) => f.id)).toEqual([2, 3, 4]); // rest, images first, capped at 3
    expect(plan.headline).toBe("Ireland");
    expect(plan.cta).toMatch(/plan your trip/i);
  });

  it("returns null when there is nothing titled to build from", () => {
    expect(planDemo([])).toBeNull();
    expect(planDemo([{ id: 9, title: "" }])).toBeNull();
  });
});

describe("runBuilderDemo", () => {
  it("builds an itinerary: cover + route map + a scene per stop + a CTA, with copy, imagery and motion", async () => {
    const r = recorder();
    await runBuilderDemo(r.ctrl, ITEMS);
    const d = r.design;

    // cover + route map + 4 stops (hero + 3 features) + CTA = 7 scenes.
    expect(d.scenes).toHaveLength(7);

    const allText = d.scenes.flatMap((s) => s.nodes.filter((n) => n.type === "text").map((n) => n.text ?? ""));
    expect(allText.some((t) => /Ireland/.test(t))).toBe(true); // cover region
    expect(allText).toContain("Your route"); // the roadmap scene
    expect(allText.some((t) => /DAY 1 OF 4/.test(t))).toBe(true); // flow through the days
    expect(allText.some((t) => /start your journey/i.test(t))).toBe(true); // CTA
    expect(allText.some((t) => /Cliffs of Moher|Wild Atlantic Way|Harbour Festival/.test(t))).toBe(true);

    // Every item with imagery became an image node referencing its approved src.
    const imageSrcs = d.scenes.flatMap((s) => s.nodes.filter((n) => n.type === "image").map((n) => n.src));
    expect(imageSrcs).toContain("blob:cliffs");
    expect(imageSrcs).toContain("blob:waw");
    expect(imageSrcs).toContain("blob:harbour");

    // The roadmap draws a dashed route (an inline-SVG image node) and a frame-sprite car follows it.
    expect(imageSrcs.some((s) => typeof s === "string" && s.startsWith("data:image/svg+xml"))).toBe(true);
    const spriteNodes = d.scenes.flatMap((s) => s.nodes.filter((n) => (n.frames?.length ?? 0) > 1));
    expect(spriteNodes.length).toBeGreaterThanOrEqual(1); // the driving-car (and other sprites)

    // Plenty of entrance/keyframe animation across the build.
    const animated = d.scenes.flatMap((s) => s.nodes.filter((n) => n.anim?.keyframes?.length));
    expect(animated.length).toBeGreaterThanOrEqual(6);

    expect(r.thoughts.length).toBeGreaterThanOrEqual(5);
    expect(r.fitted).toBe(true);
    expect(r.played).toBe(true);
    expect(r.scenesVisited[r.scenesVisited.length - 1]).toBe(0); // returns to the cover to play
  });

  it("is deterministic — same items yield the same built design", async () => {
    const a = recorder();
    const b = recorder();
    await runBuilderDemo(a.ctrl, ITEMS);
    await runBuilderDemo(b.ctrl, ITEMS);
    expect(a.design).toEqual(b.design);
  });

  it("drives the drawer to add the collection, then closes it, when a collection name is given", async () => {
    const r = recorder();
    await runBuilderDemo(r.ctrl, ITEMS, { collectionName: "West coast favourites" });
    const opening = r.thoughts.join(" | ");
    expect(opening).toMatch(/add the .*West coast favourites.* collection/i);
    // It opened the drawer, showed the collection, then closed the drawer (tidied up).
    expect(r.ui).toContain("openDrawer");
    expect(r.ui).toContain("showCollection");
    expect(r.ui).toContain("closeDrawer");
    expect(r.ui.indexOf("openDrawer")).toBeLessThan(r.ui.indexOf("closeDrawer"));
    // And closed every surface at the very end.
    expect(r.ui[r.ui.length - 1]).toBe("closeAll");
  });

  it("falls back to built-in content when no collection items are provided", async () => {
    const r = recorder();
    await runBuilderDemo(r.ctrl, []); // no collection open
    // Still builds a full multi-scene reel (from the fallback destinations) and plays it.
    expect(r.design.scenes.length).toBeGreaterThanOrEqual(3);
    expect(r.played).toBe(true);
    const text = r.design.scenes.flatMap((s) => s.nodes.map((n) => n.text)).join(" ");
    expect(text).toMatch(/Ireland|Cliffs of Moher/);
  });

  it("stops early when cancelled", async () => {
    const r = recorder();
    (r.ctrl as { cancelled: () => boolean }).cancelled = () => true;
    await runBuilderDemo(r.ctrl, ITEMS);
    // Cancelled before building scenes → only the opening thought, no extra scenes added.
    expect(r.design.scenes).toHaveLength(1);
    expect(r.played).toBe(false);
  });
});

/**
 * AI Builder — scripted demo director.
 *
 * This is the demo mechanism behind the Design Studio's "AI Builder": instead of calling a real
 * model, starting the Builder plays a deterministic, hardcoded **script** that builds a fully
 * animated multi-scene reel from a seeded collection's items — narrating its "thinking", moving an
 * on-canvas cursor, and streaming elements + copy in, so it reads like an agent operating the
 * workspace live.
 *
 * The important, reusable piece is {@link DemoController}: the small, UI-agnostic API through which
 * the "agent" interacts with the canvas (move the cursor, add/animate a node, type copy, switch
 * scene, play the preview). The hardcoded {@link runBuilderDemo} is just one driver of it; a real
 * LLM tool-use loop could drive the exact same controller later. Everything here is deterministic
 * (same items → same build), so it is unit-testable with a recording controller and no DOM.
 */
import {
  addCatalogImage,
  addCurve,
  addGraphic,
  addScene,
  addShape,
  addText,
  enterTrack,
  sampleCurve,
  setBackground,
  setCurvePoints,
  setNodeAnim,
  setSceneDuration,
  type DesignDoc,
  type EnterType,
  type NodeAnimation,
  type TextAlign,
} from "./ops";
import { ABSTRACT_ARTIFACTS, SPRITE_ANIMATIONS, STICKERS, svgDataUrl } from "./graphics";
import type { AnimKeyframe } from "./ops";

/** The subset of a selected catalog item the demo references. */
export interface DemoItem {
  id: number;
  title: string;
  destination?: string;
  description?: string;
  imageSrc?: string;
}

/** A scene-local point (0..design.width, 0..design.height). */
export interface ScenePoint {
  x: number;
  y: number;
}

/** Built-in sample content so the demo always runs, even with no collection open (text-only reel —
 * the real collection's imagery is used whenever a project with one is open). */
export const DEMO_FALLBACK_ITEMS: DemoItem[] = [
  { id: -1, title: "Cliffs of Moher", destination: "Ireland" },
  { id: -2, title: "Wild Atlantic Way", destination: "Ireland" },
  { id: -3, title: "Harbour Festival", destination: "Galway" },
  { id: -4, title: "Autumn Escapes", destination: "Ireland" },
];

/**
 * The controller the scripted agent drives — the mechanism by which "the AI" interacts with the
 * workspace. The studio page implements it against the live design/canvas; tests implement it as a
 * recorder. All motion/typing methods resolve when their (simulated) effect has played.
 */
export interface DemoController {
  /** Stream a line of the agent's "thinking" (typed out); resolves when fully shown. */
  think(text: string): Promise<void>;
  /** Glide the on-canvas AI cursor to a scene-local point on the active scene (null hides it). */
  moveTo(point: ScenePoint | null): Promise<void>;
  /** Make scene `index` the active (editable, framed) scene. */
  goToScene(index: number): Promise<void>;
  /** Apply an op that ADDS a node to `sceneIndex`; returns the new node's id (null if none added). */
  addNode(sceneIndex: number, mutate: (d: DesignDoc) => DesignDoc): Promise<string | null>;
  /** Apply an op that mutates the design without adding a node (background, animation, …). */
  update(mutate: (d: DesignDoc) => DesignDoc): Promise<void>;
  /** Stream `full` into an existing text node, character by character (looks like typing on canvas). */
  typeText(sceneIndex: number, nodeId: string, full: string): Promise<void>;
  /** Pulse-select a node to draw the eye to what the agent just touched (null clears). */
  select(sceneIndex: number, nodeId: string | null): Promise<void>;
  /** Pause for `ms` (scaled/zeroed by the implementation; tests resolve immediately). */
  wait(ms: number): Promise<void>;
  /** Frame the whole storyboard in the viewport. */
  fit(): void;
  /** Play the active scene's animation preview (the closing flourish). */
  play(): Promise<void>;
  /** Cooperative cancellation — the driver checks this between steps and bails when true. */
  cancelled(): boolean;
  // ── UI the agent operates like a person would (drives the real chrome) ─────────────────────────
  /** Move the AI cursor to an absolute studio-container pixel point (for UI chrome, not the canvas). */
  cursorTo(px: { left: number; top: number } | null): Promise<void>;
  /** Open / close the left media drawer (as if the person clicked its handle). */
  openDrawer(): Promise<void>;
  closeDrawer(): Promise<void>;
  /** Make the connected collection appear in the drawer (what "Add a collection" would produce). */
  showCollection(): Promise<void>;
  /** Close every open drawer/dialog/panel — called whenever the agent is done with a surface. */
  closeAll(): void;
}

// ── Layout constants (a 1080×1080 "social" artboard) ────────────────────────────────────────────
const W = 1080;
const H = 1080;
const MARGIN = 84;

/** The left drawer's "+ / add" control, in studio-container px (the drawer is pinned left, ~288 wide
 * with its header near the top) — where the agent "clicks" to add a collection. */
const DRAWER_ADD_PX = { left: 250, top: 96 };

/** A compact creative plan derived from the collection — the deterministic content the script lays
 * out. Pure + exported so the content choice is unit-testable without running the animation. */
export interface DemoPlan {
  /** the headline destination/label for the hero scene */
  headline: string;
  /** a one-line kicker under the headline */
  kicker: string;
  /** the hero item (prefers one with an image) */
  hero: DemoItem;
  /** up to three feature items shown on their own scenes */
  features: DemoItem[];
  /** closing call-to-action line */
  cta: string;
}

/** Choose what the demo builds from the available items (deterministic — no randomness). */
export function planDemo(items: DemoItem[]): DemoPlan | null {
  const usable = items.filter((i) => i && i.title);
  if (usable.length === 0) return null;
  const withImage = usable.filter((i) => i.imageSrc);
  const hero = withImage[0] ?? usable[0];
  // Features: the next distinct items (prefer those with imagery), up to three.
  const rest = usable.filter((i) => i.id !== hero.id);
  const features = [...rest].sort((a, b) => Number(!!b.imageSrc) - Number(!!a.imageSrc)).slice(0, 3);
  const destination = hero.destination || features.find((f) => f.destination)?.destination || "your next escape";
  return {
    headline: destination,
    kicker: `${usable.length} unmissable${hero.destination ? ` ${hero.destination}` : ""} experiences`,
    hero,
    features,
    cta: "Plan your trip today",
  };
}

const HERO_BG = "#0f2e2b"; // deep teal
const CTA_BG = "#0e6b5e";
const SAND = "#f3c96b";
const CREAM = "#f6f4ee";

/** addGraphic args for a built-in frame sprite (falls back to the first sprite for an unknown id). */
function spriteGraphic(id: string): { frames: string[]; fps: number; width: number; height: number } {
  const s = SPRITE_ANIMATIONS.find((x) => x.id === id) ?? SPRITE_ANIMATIONS[0];
  return { frames: s.frames, fps: s.fps, width: s.width, height: s.height };
}

/** addGraphic args for a built-in abstract-art shape as a soft background accent. */
function abstractGraphic(id: string): { src: string; width: number; height: number } {
  const a = ABSTRACT_ARTIFACTS.find((x) => x.id === id) ?? ABSTRACT_ARTIFACTS[0];
  return { src: svgDataUrl(a.svg), width: a.width, height: a.height };
}

/** A one-way "drift across the scene" motion track (left→right over `durMs`). */
function driftTrack(fromX: number, toX: number, y: number, durMs: number): NodeAnimation {
  return { keyframes: [{ t: 0, x: fromX, y }, { t: durMs, x: toX, y, ease: "linear" }] };
}

/** An entrance track (via enterTrack) with an optional emphasis loop layered on top (the engine
 * plays both — e.g. a scale entrance that then keeps gently pulsing). */
function entranceLoop(
  box: { x: number; y: number },
  enter: EnterType,
  startMs: number,
  durMs: number,
  loop?: NodeAnimation["loop"],
): NodeAnimation {
  const base = enterTrack(box, enter, startMs, durMs);
  return loop ? { ...base, loop } : base;
}

/** Add a soft, translucent abstract-art shape behind the content (add it BEFORE the foreground so
 * it sits at the back), with an optional slow loop for life. */
async function addAbstract(
  ctrl: DemoController,
  sceneIndex: number,
  id: string,
  box: { x: number; y: number; width: number; height: number; opacity: number },
  loop?: NodeAnimation["loop"],
): Promise<void> {
  // addGraphic attaches the loop to the node's animation when `loop` is passed.
  await ctrl.addNode(sceneIndex, (d) => addGraphic(d, sceneIndex, { ...abstractGraphic(id), loop }, box));
}

/** addGraphic args for a built-in sticker (pin/flag/star…) used as a map marker. */
function stickerGraphic(id: string): { src: string; width: number; height: number } {
  const s = STICKERS.find((x) => x.id === id) ?? STICKERS[0];
  return { src: svgDataUrl(s.svg), width: s.width, height: s.height };
}

/** Zig-zag stop points down the artboard for `n` stops — the shape of the route. */
function stopPoints(n: number): ScenePoint[] {
  const topY = 250;
  const bottomY = 860;
  const leftX = 250;
  const rightX = W - 250;
  const span = Math.max(1, n - 1);
  return Array.from({ length: n }, (_, i) => ({
    x: i % 2 === 0 ? leftX : rightX,
    y: Math.round(topY + (i / span) * (bottomY - topY)),
  }));
}

/** A keyframe track that walks a node SMOOTHLY along the curved route through `points` over `durMs`
 * (the traveller following the road). It samples the same spline the route curve renders, so the
 * car hugs the curve. `size` recentres the sprite on each sampled point. */
function followTrack(points: ScenePoint[], size: number, durMs: number): NodeAnimation {
  const path = sampleCurve(points, 12);
  const span = Math.max(1, path.length - 1);
  const keyframes: AnimKeyframe[] = path.map((p, i) => ({
    t: Math.round((i / span) * durMs),
    x: Math.round(p.x - size / 2),
    y: Math.round(p.y - size / 2),
    ease: "linear",
  }));
  return { keyframes };
}

/** Add a frame sprite that drifts all the way across the scene (frames animate + position moves). */
async function driftAcross(
  ctrl: DemoController,
  sceneIndex: number,
  spriteId: string,
  y: number,
  size: number,
  durMs = 4000,
): Promise<void> {
  const fromX = -size - 40;
  const toX = W + 40;
  const id = await ctrl.addNode(sceneIndex, (d) =>
    addGraphic(d, sceneIndex, spriteGraphic(spriteId), { x: fromX, y, width: size, height: size }),
  );
  if (id) await ctrl.update((d) => setNodeAnim(d, sceneIndex, id, driftTrack(fromX, toX, y, durMs)));
}

// ── Per-stop scene layouts (so the itinerary never looks monotonous) ────────────────────────────
/** A varied palette, cycled per stop so consecutive scenes differ (warm/cool/light rhythm). */
interface SceneTheme {
  bg: string;
  ink: string;
  accent: string;
}
const SCENE_THEMES: SceneTheme[] = [
  { bg: "#0f2e2b", ink: "#f6f4ee", accent: "#f3c96b" }, // deep teal · sand
  { bg: "#7c2d12", ink: "#fff7ed", accent: "#fdba74" }, // warm clay · apricot
  { bg: "#14233b", ink: "#e2e8f0", accent: "#38bdf8" }, // navy · sky
  { bg: "#f3ede1", ink: "#1f2937", accent: "#0f766e" }, // light cream · teal
  { bg: "#3b0764", ink: "#f8ebff", accent: "#f0abfc" }, // plum · orchid
];

/** The context a stop-scene layout needs. */
interface StopScene {
  ctrl: DemoController;
  si: number; // scene index
  i: number; // stop index (0-based)
  n: number; // total stops
  s: DemoItem; // the stop
  theme: SceneTheme;
  nextLabel: string;
}

function imgArg(s: DemoItem): { src: string; catalogItemId: string } {
  return { src: s.imageSrc!, catalogItemId: String(s.id) };
}

async function dayBadge(x: StopScene, px: number, py: number, align: TextAlign): Promise<void> {
  await x.ctrl.addNode(x.si, (d) =>
    addText(d, x.si, `DAY ${x.i + 1} OF ${x.n}`, {
      x: px, y: py, width: 460, height: 56, color: x.theme.accent, fontSize: 32, fontWeight: "bold", textAlign: align,
    }),
  );
}

async function stopTitle(
  x: StopScene,
  box: { x: number; y: number; width: number; height: number },
  align: TextAlign,
  size: number,
): Promise<void> {
  await x.ctrl.moveTo({ x: box.x + (align === "center" ? box.width / 2 : 20), y: box.y });
  const id = await x.ctrl.addNode(x.si, (d) =>
    addText(d, x.si, "", { ...box, color: x.theme.ink, fontSize: size, fontWeight: "bold", textAlign: align }),
  );
  if (id) {
    await x.ctrl.typeText(x.si, id, x.s.title);
    await x.ctrl.update((d) => setNodeAnim(d, x.si, id, enterTrack(box, "rise", 150, 600)));
    await x.ctrl.select(x.si, id);
  }
}

async function flowLine(
  x: StopScene,
  box: { x: number; y: number; width: number; height: number },
  align: TextAlign,
): Promise<void> {
  const id = await x.ctrl.addNode(x.si, (d) =>
    addText(d, x.si, "", { ...box, color: x.theme.accent, fontSize: 34, textAlign: align }),
  );
  if (id) {
    await x.ctrl.typeText(x.si, id, x.nextLabel);
    await x.ctrl.update((d) =>
      setNodeAnim(d, x.si, id, enterTrack(box, align === "right" ? "slide-right" : "slide-left", 350, 550)),
    );
  }
}

async function stickerAt(x: StopScene, id: string, px: number, py: number, size: number, loop?: NodeAnimation["loop"]): Promise<void> {
  await x.ctrl.addNode(x.si, (d) => addGraphic(d, x.si, { ...stickerGraphic(id), loop }, { x: px, y: py, width: size, height: size }));
}

/** A — full-bleed photo with a solid colour band + bold left-aligned title. */
async function layoutFullBleed(x: StopScene): Promise<void> {
  await x.ctrl.update((d) => setBackground(d, x.si, x.theme.bg));
  await addAbstract(x.ctrl, x.si, "ring", { x: W - 440, y: -180, width: 660, height: 660, opacity: 0.2 }, { type: "spin", periodMs: 15000 });
  if (x.s.imageSrc) {
    const box = { x: 0, y: 0, width: W, height: 720 };
    await x.ctrl.moveTo({ x: W / 2, y: 360 });
    const id = await x.ctrl.addNode(x.si, (d) => addCatalogImage(d, x.si, imgArg(x.s), box));
    if (id) await x.ctrl.update((d) => setNodeAnim(d, x.si, id, entranceLoop(box, "scale", 0, 650, { type: "pulse", periodMs: 4200 })));
  }
  await x.ctrl.addNode(x.si, (d) => addShape(d, x.si, "rect", { x: 0, y: 700, width: W, height: 380, color: x.theme.bg }));
  await dayBadge(x, 60, 744, "left");
  await stopTitle(x, { x: 60, y: 804, width: W - 120, height: 150 }, "left", 84);
  await flowLine(x, { x: 60, y: 952, width: W - 120, height: 60 }, "left");
  await stickerAt(x, "pin", W - 150, 56, 110, { type: "bob", periodMs: 2400 });
}

/** B — split screen: a full-height photo on one side, a text panel on the other. */
async function layoutSplit(x: StopScene): Promise<void> {
  const left = x.i % 2 === 0;
  await x.ctrl.update((d) => setBackground(d, x.si, x.theme.bg));
  await addAbstract(
    x.ctrl, x.si, "blob",
    { x: left ? 560 : -120, y: 520, width: 620, height: 620, opacity: 0.22 },
    { type: "float", periodMs: 6000 },
  );
  if (x.s.imageSrc) {
    const box = left ? { x: 0, y: 0, width: 560, height: H } : { x: W - 560, y: 0, width: 560, height: H };
    await x.ctrl.moveTo({ x: box.x + 280, y: H / 2 });
    const id = await x.ctrl.addNode(x.si, (d) => addCatalogImage(d, x.si, imgArg(x.s), box));
    if (id) await x.ctrl.update((d) => setNodeAnim(d, x.si, id, entranceLoop(box, left ? "slide-left" : "slide-right", 0, 650, { type: "float", periodMs: 5600 })));
  }
  const tx = left ? 620 : 80;
  await dayBadge(x, tx, 300, "left");
  await stopTitle(x, { x: tx, y: 360, width: 400, height: 280 }, "left", 72);
  await flowLine(x, { x: tx, y: 660, width: 400, height: 120 }, "left");
  await stickerAt(x, "sparkle", tx, 240, 56, { type: "twinkle", periodMs: 2200 });
}

/** C — a tilted "polaroid" photo card on a bold backdrop, centred title below. */
async function layoutPolaroid(x: StopScene): Promise<void> {
  await x.ctrl.update((d) => setBackground(d, x.si, x.theme.bg));
  await addAbstract(x.ctrl, x.si, "burst", { x: x.i % 2 ? -160 : W - 360, y: 120, width: 520, height: 520, opacity: 0.22 }, { type: "spin", periodMs: 14000 });
  if (x.s.imageSrc) {
    const angle = x.i % 2 ? 4 : -4;
    await x.ctrl.addNode(x.si, (d) => addShape(d, x.si, "rect", { x: 168, y: 150, width: 744, height: 710, color: "#ffffff", radius: 10, angle }));
    const box = { x: 190, y: 172, width: 700, height: 620 };
    await x.ctrl.moveTo({ x: W / 2, y: 480 });
    const id = await x.ctrl.addNode(x.si, (d) => addCatalogImage(d, x.si, imgArg(x.s), { ...box, radius: 8, angle }));
    if (id) await x.ctrl.update((d) => setNodeAnim(d, x.si, id, entranceLoop({ x: box.x, y: box.y }, "rise", 0, 650)));
  }
  await dayBadge(x, MARGIN, 70, "center");
  await stopTitle(x, { x: MARGIN, y: 880, width: W - 2 * MARGIN, height: 100 }, "center", 60);
  await flowLine(x, { x: MARGIN, y: 980, width: W - 2 * MARGIN, height: 60 }, "center");
  await stickerAt(x, "star", W - 170, 820, 100, { type: "twinkle", periodMs: 2000 });
}

/** D — a circular photo "spotlight" inside a ring, centred title. */
async function layoutCircle(x: StopScene): Promise<void> {
  await x.ctrl.update((d) => setBackground(d, x.si, x.theme.bg));
  await addAbstract(x.ctrl, x.si, "ring", { x: W / 2 - 370, y: 150, width: 740, height: 740, opacity: 0.24 }, { type: "spin", periodMs: 16000 });
  await addAbstract(x.ctrl, x.si, "dots", { x: 70, y: 70, width: 220, height: 220, opacity: 0.2 }, { type: "float", periodMs: 5200 });
  if (x.s.imageSrc) {
    const box = { x: 240, y: 180, width: 600, height: 600 };
    await x.ctrl.moveTo({ x: W / 2, y: 480 });
    const id = await x.ctrl.addNode(x.si, (d) => addCatalogImage(d, x.si, imgArg(x.s), { ...box, radius: 300 }));
    if (id) await x.ctrl.update((d) => setNodeAnim(d, x.si, id, entranceLoop(box, "scale", 0, 650, { type: "pulse", periodMs: 3800 })));
  }
  await dayBadge(x, MARGIN, 70, "center");
  await stopTitle(x, { x: MARGIN, y: 820, width: W - 2 * MARGIN, height: 100 }, "center", 66);
  await flowLine(x, { x: MARGIN, y: 930, width: W - 2 * MARGIN, height: 60 }, "center");
}

const STOP_LAYOUTS = [layoutFullBleed, layoutSplit, layoutPolaroid, layoutCircle];

/**
 * Run the hardcoded AI-Builder demo against a controller. Builds a hero scene, one scene per
 * feature, and a CTA scene — each narrated, cursor-led, with streamed copy and entrance animations —
 * then frames and plays the result. Deterministic given `items`. Honours cancellation between steps.
 */
export async function runBuilderDemo(
  ctrl: DemoController,
  items: DemoItem[],
  opts: { collectionName?: string } = {},
): Promise<void> {
  // Use the open collection when there is one; otherwise fall back to built-in content so the demo
  // always has something to build (the mechanism is the point of the demo, not the exact data).
  const effective = items.some((i) => i && i.title) ? items : DEMO_FALLBACK_ITEMS;
  const plan = planDemo(effective);
  if (!plan) {
    await ctrl.think("I need at least one catalog item in this workspace to design from.");
    return;
  }
  const guard = () => ctrl.cancelled();
  const withImages = effective.filter((i) => i.imageSrc).length;

  // Open the media library and "add" the collection — exactly as a person would — then tidy up.
  if (opts.collectionName) {
    await ctrl.think(`Opening the media library to add the “${opts.collectionName}” collection…`);
    await ctrl.openDrawer();
    if (guard()) return;
    await ctrl.cursorTo(DRAWER_ADD_PX);
    await ctrl.think("Adding the collection to this workspace…");
    await ctrl.showCollection();
    await ctrl.wait(900);
    await ctrl.think(
      withImages > 0 ? `Pulled in ${withImages} photos. Now let's plan the route.` : "Collection added. Now let's plan the route.",
    );
    await ctrl.cursorTo(null);
    await ctrl.closeDrawer(); // done with the drawer → close it
    if (guard()) return;
  }

  // The ordered stops of the itinerary — the hero leads, then each feature destination.
  const stops: DemoItem[] = [plan.hero, ...plan.features];
  const region = plan.headline;
  await ctrl.think(`Designing a ${stops.length}-stop itinerary through ${region}.`);
  if (guard()) return;

  // ── Scene 0 — itinerary cover ──────────────────────────────────────────────────────────────────
  await ctrl.goToScene(0);
  await ctrl.update((d) => setBackground(d, 0, HERO_BG));
  await addAbstract(ctrl, 0, "ring", { x: W - 380, y: -140, width: 560, height: 560, opacity: 0.16 }, { type: "spin", periodMs: 16000 });
  await addAbstract(ctrl, 0, "blob", { x: -160, y: 620, width: 480, height: 480, opacity: 0.13 }, { type: "float", periodMs: 6000 });

  const coverTitleBox = { x: MARGIN, y: 340, width: W - 2 * MARGIN, height: 240 };
  await ctrl.moveTo({ x: coverTitleBox.x, y: coverTitleBox.y });
  const coverTitleId = await ctrl.addNode(0, (d) =>
    addText(d, 0, "", { ...coverTitleBox, color: CREAM, fontSize: 104, fontWeight: "bold", textAlign: "center", lineHeight: 1.05 }),
  );
  if (coverTitleId) {
    await ctrl.typeText(0, coverTitleId, `${region}\nRoad Trip`);
    await ctrl.update((d) => setNodeAnim(d, 0, coverTitleId, enterTrack(coverTitleBox, "rise", 100, 650)));
  }
  const coverSubBox = { x: MARGIN, y: 600, width: W - 2 * MARGIN, height: 90 };
  await ctrl.moveTo({ x: coverSubBox.x, y: coverSubBox.y });
  const coverSubId = await ctrl.addNode(0, (d) =>
    addText(d, 0, "", { ...coverSubBox, color: SAND, fontSize: 44, textAlign: "center" }),
  );
  if (coverSubId) {
    await ctrl.typeText(0, coverSubId, `${stops.length} stops · a self-drive journey`);
    await ctrl.update((d) => setNodeAnim(d, 0, coverSubId, enterTrack(coverSubBox, "fade", 350, 600)));
  }
  await ctrl.think("A traveller to set the mood.");
  await driftAcross(ctrl, 0, "driving-car", 770, 190, 4200);
  if (guard()) return;

  // ── Scene 1 — the route map (the signature roadmap / flow visual) ──────────────────────────────
  await ctrl.think("Mapping the route between the stops…");
  await ctrl.update((d) => addScene(d));
  await ctrl.goToScene(1);
  await ctrl.update((d) => setBackground(d, 1, "#0e2a2f"));
  await ctrl.update((d) => setSceneDuration(d, d.scenes[1].id, 6500)); // time for the car to travel

  const pts = stopPoints(stops.length);
  // The route itself — a real editable CURVE smoothed through the stops (behind the markers). The
  // agent "draws" it, and it stays fully editable (drag its anchors) after the demo.
  await ctrl.think("Drawing the route as a curve through the stops.");
  const routeId = await ctrl.addNode(1, (d) => addCurve(d, 1, { stroke: SAND, strokeWidth: 9 }));
  if (routeId) await ctrl.update((d) => setCurvePoints(d, 1, routeId, pts));
  const mapTitleBox = { x: MARGIN, y: 70, width: W - 2 * MARGIN, height: 90 };
  const mapTitleId = await ctrl.addNode(1, (d) =>
    addText(d, 1, "", { ...mapTitleBox, color: CREAM, fontSize: 56, fontWeight: "bold", textAlign: "center" }),
  );
  if (mapTitleId) await ctrl.typeText(1, mapTitleId, "Your route");

  // A pin + number + label at each stop, revealed in order.
  for (let i = 0; i < stops.length; i++) {
    if (guard()) return;
    const p = pts[i];
    const onLeft = i % 2 === 0;
    await ctrl.moveTo(p);
    const pin = 76;
    const pinX = Math.round(p.x - pin / 2);
    const pinY = Math.round(p.y - pin);
    const pinId = await ctrl.addNode(1, (d) =>
      addGraphic(d, 1, stickerGraphic("pin"), { x: pinX, y: pinY, width: pin, height: pin }),
    );
    if (pinId) await ctrl.update((d) => setNodeAnim(d, 1, pinId, enterTrack({ x: pinX, y: pinY }, "rise", i * 120, 450)));
    await ctrl.addNode(1, (d) =>
      addText(d, 1, String(i + 1), { x: Math.round(p.x - 20), y: Math.round(p.y - 66), width: 40, height: 40, color: "#ffffff", fontSize: 30, fontWeight: "bold", textAlign: "center" }),
    );
    const labelW = 380;
    const labelX = onLeft ? Math.round(p.x + 56) : Math.round(p.x - 56 - labelW);
    const labelId = await ctrl.addNode(1, (d) =>
      addText(d, 1, stops[i].title, { x: labelX, y: Math.round(p.y - 44), width: labelW, height: 70, color: CREAM, fontSize: 36, fontWeight: "bold", textAlign: onLeft ? "left" : "right" }),
    );
    if (labelId) {
      await ctrl.update((d) =>
        setNodeAnim(d, 1, labelId, enterTrack({ x: labelX, y: Math.round(p.y - 44) }, onLeft ? "slide-left" : "slide-right", i * 120 + 150, 450)),
      );
    }
  }
  // The car drives the whole route, stop to stop (frames animate + follows the polyline).
  await ctrl.think("…and a car driving the route, stop to stop.");
  const carSize = 150;
  const carId = await ctrl.addNode(1, (d) =>
    addGraphic(d, 1, spriteGraphic("driving-car"), {
      x: Math.round(pts[0].x - carSize / 2),
      y: Math.round(pts[0].y - carSize / 2),
      width: carSize,
      height: carSize,
    }),
  );
  if (carId) await ctrl.update((d) => setNodeAnim(d, 1, carId, followTrack(pts, carSize, 6000)));
  if (guard()) return;

  // ── Per-stop detail scenes — each stop gets a DIFFERENT layout + palette so the deck never feels
  //    monotonous (full-bleed · split · polaroid · circle spotlight, cycled). ───────────────────────
  for (let i = 0; i < stops.length; i++) {
    if (guard()) return;
    const s = stops[i];
    const si = 2 + i;
    await ctrl.think(`Stop ${i + 1}: ${s.title}.`);
    await ctrl.update((d) => addScene(d));
    await ctrl.goToScene(si);
    const ctx: StopScene = {
      ctrl,
      si,
      i,
      n: stops.length,
      s,
      theme: SCENE_THEMES[i % SCENE_THEMES.length],
      nextLabel: i < stops.length - 1 ? `→  Next: ${stops[i + 1].title}` : "→  Journey complete",
    };
    await STOP_LAYOUTS[i % STOP_LAYOUTS.length](ctx);
    // A small car motif threads the journey together (varied entry y per layout).
    await driftAcross(ctrl, si, "driving-car", 1000 - (i % 2) * 40, 140, 4200);
  }

  // ── Closing CTA ────────────────────────────────────────────────────────────────────────────────
  if (guard()) return;
  const ctaIndex = 2 + stops.length;
  await ctrl.think("Closing with a call to action.");
  await ctrl.update((d) => addScene(d));
  await ctrl.goToScene(ctaIndex);
  await ctrl.update((d) => setBackground(d, ctaIndex, CTA_BG));
  await addAbstract(ctrl, ctaIndex, "ring", { x: W / 2 - 300, y: 120, width: 600, height: 600, opacity: 0.14 }, { type: "spin", periodMs: 18000 });
  await addAbstract(ctrl, ctaIndex, "dots", { x: 56, y: 820, width: 300, height: 300, opacity: 0.18 }, { type: "float", periodMs: 5000 });

  const ctaTitleBox = { x: MARGIN, y: 420, width: W - 2 * MARGIN, height: 150 };
  await ctrl.moveTo({ x: ctaTitleBox.x, y: ctaTitleBox.y });
  const ctaTitleId = await ctrl.addNode(ctaIndex, (d) =>
    addText(d, ctaIndex, "", { ...ctaTitleBox, color: CREAM, fontSize: 92, fontWeight: "bold", textAlign: "center" }),
  );
  if (ctaTitleId) {
    await ctrl.typeText(ctaIndex, ctaTitleId, "Start your journey");
    await ctrl.update((d) =>
      setNodeAnim(d, ctaIndex, ctaTitleId, entranceLoop(ctaTitleBox, "scale", 0, 600, { type: "pulse", periodMs: 3000 })),
    );
  }
  const ctaSubBox = { x: MARGIN, y: 580, width: W - 2 * MARGIN, height: 90 };
  const ctaSubId = await ctrl.addNode(ctaIndex, (d) =>
    addText(d, ctaIndex, "", { ...ctaSubBox, color: SAND, fontSize: 40, textAlign: "center" }),
  );
  if (ctaSubId) {
    await ctrl.typeText(ctaIndex, ctaSubId, `${region} · ${stops.length} unforgettable stops`);
    await ctrl.update((d) => setNodeAnim(d, ctaIndex, ctaSubId, enterTrack(ctaSubBox, "fade", 300, 600)));
  }
  await ctrl.addNode(ctaIndex, (d) =>
    addGraphic(d, ctaIndex, spriteGraphic("twinkle-star"), { x: W / 2 - 60, y: 720, width: 120, height: 120 }),
  );
  await driftAcross(ctrl, ctaIndex, "driving-car", 820, 170, 4000);

  // ── Flourish: tidy the UI, frame the storyboard, and play from the top ─────────────────────────
  if (guard()) return;
  await ctrl.moveTo(null);
  ctrl.closeAll(); // every surface closed now the build is done
  ctrl.fit();
  await ctrl.think("Done — a fully animated itinerary, ready to refine or export.");
  await ctrl.goToScene(0);
  await ctrl.play();
}

// Built-in decorative entities for the studio's right rail: abstract artifacts, stickers, and
// prebuilt sprite animations. Each is a self-contained SVG (served as a data: URL so Fabric renders
// it on the canvas, the PNG export and the video frames). A sprite also carries a ready animation
// *intent* (entrance + emphasis loop) that is built into a keyframe track at placement time (so the
// track is anchored at the element's real position).
import type { EnterType, NodeAnimation } from "./ops";

export interface GraphicDef {
  id: string;
  label: string;
  /** SVG markup; turned into a data: URL at insert time. */
  svg: string;
  /** Default placement size on the canvas. */
  width: number;
  height: number;
}

export interface SpriteDef extends GraphicDef {
  /** Entrance preset (built into keyframes at placement) and/or an emphasis loop. */
  enter: EnterType | null;
  loop?: NodeAnimation["loop"];
}

/** Turn an SVG string into a data: URL Fabric can load as an image. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}

const svg = (body: string, vb = 200) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" width="${vb}" height="${vb}">${body}</svg>`;

// ── Abstract artifacts (decorative shapes) ─────────────────────────────────────────────────────
export const ABSTRACT_ARTIFACTS: GraphicDef[] = [
  { id: "blob", label: "Blob", width: 360, height: 360, svg: svg('<path d="M160 36c38 12 58 44 54 86-4 40-34 54-52 76-22 26-20 54-56 52-34-2-66-28-72-66-6-40 18-66 36-96 20-34 52-66 90-52z" fill="#5eead4"/>') },
  { id: "wave", label: "Wave", width: 420, height: 180, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" width="200" height="90"><path d="M0 50 Q25 20 50 50 T100 50 T150 50 T200 50 V90 H0 Z" fill="#38bdf8"/></svg>` },
  { id: "burst", label: "Burst", width: 320, height: 320, svg: svg('<g fill="#f59e0b"><path d="M100 10l14 46 46-14-34 36 44 22-50 2 18 46-38-32-38 32 18-46-50-2 44-22-34-36 46 14z"/></g>') },
  { id: "ring", label: "Ring", width: 300, height: 300, svg: svg('<circle cx="100" cy="100" r="78" fill="none" stroke="#a78bfa" stroke-width="24"/>') },
  { id: "arch", label: "Arch", width: 300, height: 320, svg: svg('<path d="M30 190V100a70 70 0 01140 0v90h-34v-90a36 36 0 00-72 0v90z" fill="#fb7185"/>') },
  { id: "dots", label: "Dot grid", width: 280, height: 280, svg: svg('<g fill="#0f766e">' + [40, 80, 120, 160].flatMap((y) => [40, 80, 120, 160].map((x) => `<circle cx="${x}" cy="${y}" r="9"/>`)).join("") + "</g>") },
];

// ── Stickers (fun icons) ───────────────────────────────────────────────────────────────────────
export const STICKERS: GraphicDef[] = [
  { id: "star", label: "Star", width: 220, height: 220, svg: svg('<path d="M100 14l24 52 57 6-43 38 12 56-50-29-50 29 12-56-43-38 57-6z" fill="#facc15" stroke="#eab308" stroke-width="4"/>') },
  { id: "heart", label: "Heart", width: 220, height: 200, svg: svg('<path d="M100 170S24 120 24 72a40 40 0 0176-18 40 40 0 0176 18c0 48-76 98-76 98z" fill="#fb7185"/>') },
  { id: "sparkle", label: "Sparkle", width: 200, height: 200, svg: svg('<path d="M100 20c6 46 34 74 80 80-46 6-74 34-80 80-6-46-34-74-80-80 46-6 74-34 80-80z" fill="#c084fc"/>') },
  { id: "sun", label: "Sun", width: 240, height: 240, svg: svg('<g fill="#f59e0b"><circle cx="100" cy="100" r="40"/>' + Array.from({ length: 8 }, (_, i) => `<rect x="96" y="12" width="8" height="26" rx="4" transform="rotate(${i * 45} 100 100)"/>`).join("") + "</g>") },
  { id: "pin", label: "Pin", width: 180, height: 220, svg: svg('<path d="M100 30a50 50 0 00-50 50c0 40 50 90 50 90s50-50 50-90a50 50 0 00-50-50z" fill="#ef4444"/><circle cx="100" cy="80" r="18" fill="#fff"/>') },
  { id: "bolt", label: "Bolt", width: 170, height: 230, svg: svg('<path d="M110 20L50 115h40l-20 65 80-100h-44z" fill="#fde047" stroke="#eab308" stroke-width="4"/>') },
  { id: "check", label: "Check", width: 210, height: 210, svg: svg('<circle cx="100" cy="100" r="84" fill="#22c55e"/><path d="M62 104l26 26 50-58" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>') },
  { id: "bubble", label: "Speech", width: 240, height: 200, svg: svg('<path d="M30 40h140a20 20 0 0120 20v60a20 20 0 01-20 20H90l-34 30v-30H30a20 20 0 01-20-20V60a20 20 0 0120-20z" fill="#60a5fa"/>') },
];

// ── Prebuilt sprite animations ─────────────────────────────────────────────────────────────────
// A base graphic + an animation intent (entrance + emphasis loop), resolved to keyframes on insert.
function sprite(id: string, label: string, def: GraphicDef, enter: EnterType | null, loop?: NodeAnimation["loop"]): SpriteDef {
  return { id, label, svg: def.svg, width: def.width, height: def.height, enter, loop };
}

const STAR = STICKERS.find((s) => s.id === "star")!;
const SPARKLE = STICKERS.find((s) => s.id === "sparkle")!;
const RING = ABSTRACT_ARTIFACTS.find((a) => a.id === "ring")!;
const BOLT = STICKERS.find((s) => s.id === "bolt")!;
const BUBBLE = STICKERS.find((s) => s.id === "bubble")!;

export const SPRITE_ANIMATIONS: SpriteDef[] = [
  sprite("pulse-star", "Pulsing star", STAR, "scale", { type: "pulse", periodMs: 1200 }),
  sprite("float-ring", "Floating ring", RING, "fade", { type: "bob", periodMs: 2000 }),
  sprite("pop-sparkle", "Pop sparkle", SPARKLE, "scale", undefined),
  sprite("rise-bubble", "Rise-in bubble", BUBBLE, "rise", undefined),
  sprite("buzz-bolt", "Buzzing bolt", BOLT, "fade", { type: "pulse", periodMs: 700 }),
];

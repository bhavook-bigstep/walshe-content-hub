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
// Cute, recognisable artwork (a panda, a flower, a balloon…) that MOVES on the canvas, preview and
// exported video. The motion is a declarative keyframe track (entrance) + a named character loop
// (anim.ts) applied to the whole node — NOT animation inside the SVG, which Fabric rasterises to a
// single frozen frame and so never plays (see memory: studio-svg-animation-rasterization). Each
// SVG's resting pose is designed to look complete on its own.
function svgVB(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

/** A sprite = cute art + a size + an entrance preset + a character loop. */
function spriteDef(
  id: string,
  label: string,
  art: string,
  width: number,
  height: number,
  enter: EnterType | null,
  loop?: NodeAnimation["loop"],
): SpriteDef {
  return { id, label, svg: art, width, height, enter, loop };
}

// Artwork. Kept compact and hand-authored; friendly rounded shapes, 2–4 colours each.
const PANDA = svgVB(120, 100,
  '<rect x="42" y="74" width="14" height="20" rx="7" fill="#1f2937"/><rect x="64" y="74" width="14" height="20" rx="7" fill="#1f2937"/>' +
  '<ellipse cx="27" cy="58" rx="9" ry="15" fill="#1f2937"/><ellipse cx="93" cy="58" rx="9" ry="15" fill="#1f2937"/>' +
  '<circle cx="36" cy="30" r="12" fill="#1f2937"/><circle cx="84" cy="30" r="12" fill="#1f2937"/>' +
  '<ellipse cx="60" cy="56" rx="36" ry="30" fill="#fff" stroke="#1f2937" stroke-width="3"/>' +
  '<ellipse cx="48" cy="50" rx="9" ry="12" fill="#1f2937" transform="rotate(-18 48 50)"/>' +
  '<ellipse cx="72" cy="50" rx="9" ry="12" fill="#1f2937" transform="rotate(18 72 50)"/>' +
  '<circle cx="49" cy="51" r="4" fill="#fff"/><circle cx="71" cy="51" r="4" fill="#fff"/>' +
  '<circle cx="50" cy="52" r="2" fill="#111"/><circle cx="72" cy="52" r="2" fill="#111"/>' +
  '<circle cx="42" cy="64" r="4" fill="#fbcfe8"/><circle cx="78" cy="64" r="4" fill="#fbcfe8"/>' +
  '<path d="M56 62h8l-4 5z" fill="#1f2937"/>' +
  '<path d="M60 67q-4 5-9 3M60 67q4 5 9 3" stroke="#1f2937" stroke-width="2" fill="none" stroke-linecap="round"/>');

const FLOWER = svgVB(100, 110,
  '<path d="M50 58Q50 86 50 106" stroke="#16a34a" stroke-width="6" fill="none" stroke-linecap="round"/>' +
  '<path d="M50 84q-20-6-26 10q22 6 26-10z" fill="#22c55e"/><path d="M50 94q20-6 26 10q-22 6-26-10z" fill="#4ade80"/>' +
  '<g>' + Array.from({ length: 6 }, (_, i) =>
    `<ellipse cx="50" cy="22" rx="10" ry="18" fill="#fb7185" stroke="#f43f5e" stroke-width="1.5" transform="rotate(${i * 60} 50 40)"/>`).join("") + '</g>' +
  '<circle cx="50" cy="40" r="12" fill="#fbbf24" stroke="#f59e0b" stroke-width="2"/>' +
  '<circle cx="46" cy="37" r="2" fill="#fde68a"/><circle cx="53" cy="42" r="2" fill="#fde68a"/>');

const BREEZE = svgVB(140, 80,
  '<path d="M10 26H86a10 10 0 1 0-10-10" fill="none" stroke="#60a5fa" stroke-width="6" stroke-linecap="round"/>' +
  '<path d="M10 48H112a11 11 0 1 1-11 11" fill="none" stroke="#93c5fd" stroke-width="6" stroke-linecap="round"/>' +
  '<path d="M10 66H72a8 8 0 1 0-8-8" fill="none" stroke="#bae6fd" stroke-width="5" stroke-linecap="round"/>');

const BALLOON_AIR = svgVB(90, 120,
  '<path d="M45 8C22 8 10 28 10 46C10 70 32 84 45 92C58 84 80 70 80 46C80 28 68 8 45 8Z" fill="#ef4444"/>' +
  '<path d="M45 8C35 10 30 30 30 50C30 68 38 82 45 92C52 82 60 68 60 50C60 30 55 10 45 8Z" fill="#f59e0b"/>' +
  '<path d="M45 8C41 10 40 30 40 50C40 70 43 84 45 92C47 84 50 70 50 50C50 30 49 10 45 8Z" fill="#fde047"/>' +
  '<ellipse cx="33" cy="34" rx="6" ry="12" fill="#fff" opacity="0.35"/>' +
  '<path d="M34 86L40 104M56 86L50 104" stroke="#78350f" stroke-width="2"/>' +
  '<rect x="37" y="103" width="16" height="13" rx="2" fill="#92400e"/>');

const CLOUD = svgVB(120, 80,
  '<circle cx="26" cy="26" r="12" fill="#fcd34d"/>' +
  '<ellipse cx="62" cy="56" rx="46" ry="14" fill="#e5e7eb"/>' +
  '<circle cx="42" cy="44" r="20" fill="#fff"/><circle cx="66" cy="34" r="26" fill="#fff"/>' +
  '<circle cx="92" cy="46" r="18" fill="#fff"/><rect x="38" y="46" width="62" height="20" rx="10" fill="#fff"/>');

const BIRD = svgVB(110, 80,
  '<path d="M30 46L8 40l6 15z" fill="#0284c7"/>' +
  '<ellipse cx="54" cy="46" rx="26" ry="20" fill="#38bdf8"/>' +
  '<ellipse cx="50" cy="54" rx="15" ry="11" fill="#e0f2fe"/>' +
  '<path d="M54 40q22-15 40-6q-14 17-36 12z" fill="#0ea5e9"/>' +
  '<path d="M80 43l16 4-16 7z" fill="#f59e0b"/>' +
  '<circle cx="70" cy="40" r="5" fill="#fff"/><circle cx="71" cy="41" r="2.5" fill="#111"/>');

const BOAT = svgVB(120, 100,
  '<path d="M58 18l14 5-14 5z" fill="#f59e0b"/><rect x="56" y="18" width="4" height="48" fill="#92400e"/>' +
  '<path d="M54 24L30 62h24z" fill="#fca5a5"/><path d="M62 24l28 38H62z" fill="#fff" stroke="#e5e7eb" stroke-width="2"/>' +
  '<path d="M26 64h68l-10 20H36z" fill="#ef4444" stroke="#b91c1c" stroke-width="2"/>' +
  '<path d="M4 84q12-8 24 0t24 0t24 0t24 0t24 0" stroke="#38bdf8" stroke-width="5" fill="none" stroke-linecap="round"/>' +
  '<path d="M4 94q12-8 24 0t24 0t24 0t24 0t24 0" stroke="#7dd3fc" stroke-width="4" fill="none" stroke-linecap="round"/>');

const SUN = svgVB(110, 110,
  '<g fill="#f59e0b">' + Array.from({ length: 12 }, (_, i) =>
    `<rect x="51" y="6" width="8" height="20" rx="4" transform="rotate(${i * 30} 55 55)"/>`).join("") + '</g>' +
  '<circle cx="55" cy="55" r="30" fill="#fde68a"/><circle cx="55" cy="55" r="24" fill="#fbbf24"/>');

const LEAF = svgVB(90, 100,
  '<path d="M45 8C18 24 14 64 38 92c2 2 6 2 8 0C72 64 72 24 45 8Z" fill="#ea580c"/>' +
  '<path d="M45 16L44 88" stroke="#9a3412" stroke-width="3" fill="none" stroke-linecap="round"/>' +
  '<path d="M45 36L30 46M45 52L62 60M45 66L32 74" stroke="#9a3412" stroke-width="2" fill="none" stroke-linecap="round"/>');

const STAR_BIG = svgVB(100, 100,
  '<path d="M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z" fill="#fbbf24" stroke="#f59e0b" stroke-width="3" stroke-linejoin="round"/>' +
  '<circle cx="42" cy="40" r="5" fill="#fff" opacity="0.55"/>' +
  '<path d="M84 18l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fde68a"/>');

const BALLOON_PARTY = svgVB(80, 120,
  '<ellipse cx="40" cy="44" rx="28" ry="34" fill="#f472b6"/>' +
  '<ellipse cx="30" cy="32" rx="7" ry="12" fill="#fff" opacity="0.4"/>' +
  '<path d="M36 76l4 8 4-8z" fill="#ec4899"/>' +
  '<path d="M40 84q8 16-2 30" stroke="#9ca3af" stroke-width="2" fill="none"/>');

const PIN = svgVB(80, 110,
  '<ellipse cx="40" cy="100" rx="16" ry="4" fill="#000" opacity="0.1"/>' +
  '<path d="M40 10C24 10 12 22 12 38C12 62 40 92 40 92S68 62 68 38C68 22 56 10 40 10Z" fill="#ef4444" stroke="#b91c1c" stroke-width="2"/>' +
  '<circle cx="40" cy="38" r="12" fill="#fff"/>');

export const SPRITE_ANIMATIONS: SpriteDef[] = [
  spriteDef("walking-panda", "Walking panda", PANDA, 220, 183, "scale", { type: "waddle", periodMs: 900 }),
  spriteDef("blooming-flower", "Blooming flower", FLOWER, 180, 198, "scale", { type: "sway", periodMs: 2600 }),
  spriteDef("breeze", "Breeze", BREEZE, 280, 160, "fade", { type: "drift", periodMs: 3000 }),
  spriteDef("hot-air-balloon", "Hot-air balloon", BALLOON_AIR, 150, 200, "rise", { type: "float", periodMs: 3800 }),
  spriteDef("drifting-cloud", "Drifting cloud", CLOUD, 240, 160, "fade", { type: "drift", periodMs: 5000 }),
  spriteDef("flapping-bird", "Gliding bird", BIRD, 220, 160, "slide-left", { type: "float", periodMs: 1500 }),
  spriteDef("bobbing-boat", "Bobbing boat", BOAT, 240, 200, "rise", { type: "rock", periodMs: 2600 }),
  spriteDef("spinning-sun", "Spinning sun", SUN, 200, 200, "scale", { type: "spin", periodMs: 16000 }),
  spriteDef("falling-leaf", "Falling leaf", LEAF, 160, 178, "fade", { type: "sway", periodMs: 2200 }),
  spriteDef("twinkle-star", "Twinkling star", STAR_BIG, 170, 170, "scale", { type: "twinkle", periodMs: 1600 }),
  spriteDef("party-balloon", "Party balloon", BALLOON_PARTY, 150, 225, "rise", { type: "float", periodMs: 3200 }),
  spriteDef("pulse-pin", "Pulsing pin", PIN, 150, 206, "rise", { type: "pulse", periodMs: 1500 }),
];

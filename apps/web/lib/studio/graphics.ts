// Built-in decorative entities for the studio's right rail: abstract artifacts, stickers, and
// prebuilt sprite animations. Artifacts/stickers are single self-contained SVGs. Sprites are classic
// frame-by-frame animations: a filmstrip of SVG frames cycled over time (like a 2D game sprite), so
// the parts themselves move — legs step, wings flap, petals bloom, rays spin — on the canvas preview
// AND in the exported video (the engine swaps the shown frame per output frame; see anim.ts
// frameIndexAt + fabric-nodes.ts setSpriteFrame).
import type { EnterType, NodeAnimation } from "./ops";

export interface GraphicDef {
  id: string;
  label: string;
  /** SVG markup; turned into a data: URL at insert time. For a sprite this is frame 0 (thumbnail). */
  svg: string;
  /** Default placement size on the canvas. */
  width: number;
  height: number;
}

export interface SpriteDef extends GraphicDef {
  /** The filmstrip: ordered frame image data: URLs, cycled at `fps` (classic sprite animation). */
  frames: string[];
  /** Frames per second for playback. */
  fps: number;
  /** Optional whole-node entrance/loop (unused by frame sprites; kept for API compatibility). */
  enter?: EnterType | null;
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Frame-by-frame sprites. Each generator returns an array of SVG frames of IDENTICAL size (so the
// filmstrip swaps cleanly), hand-animated so individual parts move between frames.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const TAU = Math.PI * 2;
const r1 = (n: number) => Math.round(n * 10) / 10;
const svgVB = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

// Walking panda — legs step alternately, arms swing, body bobs.
function pandaFrames(): string[] {
  const N = 6;
  return Array.from({ length: N }, (_, i) => {
    const ph = (i / N) * TAU;
    const bob = -Math.abs(Math.sin(ph * 2)) * 2;
    const lLift = Math.max(0, Math.sin(ph)) * 9;
    const rLift = Math.max(0, Math.sin(ph + Math.PI)) * 9;
    const lx = Math.cos(ph) * 3;
    const rx = Math.cos(ph + Math.PI) * 3;
    const b = (y: number) => r1(y + bob);
    return svgVB(120, 100,
      `<rect x="${r1(46 + lx)}" y="${r1(74 - lLift)}" width="14" height="22" rx="7" fill="#1f2937"/>` +
      `<rect x="${r1(64 + rx)}" y="${r1(74 - rLift)}" width="14" height="22" rx="7" fill="#1f2937"/>` +
      `<ellipse cx="${r1(27 + rx)}" cy="${b(58)}" rx="9" ry="15" fill="#1f2937"/>` +
      `<ellipse cx="${r1(93 + lx)}" cy="${b(58)}" rx="9" ry="15" fill="#1f2937"/>` +
      `<circle cx="36" cy="${b(30)}" r="12" fill="#1f2937"/><circle cx="84" cy="${b(30)}" r="12" fill="#1f2937"/>` +
      `<ellipse cx="60" cy="${b(56)}" rx="36" ry="30" fill="#fff" stroke="#1f2937" stroke-width="3"/>` +
      `<ellipse cx="48" cy="${b(50)}" rx="9" ry="12" fill="#1f2937" transform="rotate(-18 48 ${b(50)})"/>` +
      `<ellipse cx="72" cy="${b(50)}" rx="9" ry="12" fill="#1f2937" transform="rotate(18 72 ${b(50)})"/>` +
      `<circle cx="49" cy="${b(51)}" r="4" fill="#fff"/><circle cx="71" cy="${b(51)}" r="4" fill="#fff"/>` +
      `<circle cx="50" cy="${b(52)}" r="2" fill="#111"/><circle cx="72" cy="${b(52)}" r="2" fill="#111"/>` +
      `<path d="M56 ${b(62)}h8l-4 5z" fill="#1f2937"/>`,
    );
  });
}

// Blooming flower — the petal + centre cluster grows from the core over the frames, then sways.
function flowerFrames(): string[] {
  const N = 8;
  const petals = Array.from({ length: 6 }, (_, k) =>
    `<ellipse cx="50" cy="22" rx="10" ry="18" fill="#fb7185" stroke="#f43f5e" stroke-width="1.5" transform="rotate(${k * 60} 50 40)"/>`).join("");
  return Array.from({ length: N }, (_, i) => {
    const g = Math.min(1, (i + 1) / 6);
    const sway = i >= 6 ? Math.sin((i - 5) * 1.2) * 5 : 0;
    return svgVB(100, 110,
      `<path d="M50 58Q50 86 50 106" stroke="#16a34a" stroke-width="6" fill="none" stroke-linecap="round"/>` +
      `<path d="M50 84q-20-6-26 10q22 6 26-10z" fill="#22c55e"/><path d="M50 94q20-6 26 10q-22 6-26-10z" fill="#4ade80"/>` +
      `<g transform="rotate(${r1(sway)} 50 40) translate(50 40) scale(${r1(g)}) translate(-50 -40)">${petals}` +
      `<circle cx="50" cy="40" r="12" fill="#fbbf24" stroke="#f59e0b" stroke-width="2"/>` +
      `<circle cx="46" cy="37" r="2" fill="#fde68a"/><circle cx="53" cy="42" r="2" fill="#fde68a"/></g>`,
    );
  });
}

// Gliding bird — the wing beats up and down.
function birdFrames(): string[] {
  return [-34, -8, 22, -8].map((a) => svgVB(110, 80,
    `<path d="M30 46L8 40l6 15z" fill="#0284c7"/>` +
    `<ellipse cx="54" cy="46" rx="26" ry="20" fill="#38bdf8"/>` +
    `<ellipse cx="50" cy="54" rx="15" ry="11" fill="#e0f2fe"/>` +
    `<path d="M80 43l16 4-16 7z" fill="#f59e0b"/>` +
    `<circle cx="70" cy="40" r="5" fill="#fff"/><circle cx="71" cy="41" r="2.5" fill="#111"/>` +
    `<path d="M54 40q22-15 40-6q-14 17-36 12z" fill="#0ea5e9" transform="rotate(${a} 56 42)"/>`,
  ));
}

// Spinning sun — the ray halo rotates 5° per frame (12 rays, 30° apart → seamless loop over 6).
function sunFrames(): string[] {
  const N = 6;
  return Array.from({ length: N }, (_, i) => {
    const rot = i * 5;
    const rays = Array.from({ length: 12 }, (_, k) =>
      `<rect x="51" y="6" width="8" height="20" rx="4" transform="rotate(${k * 30 + rot} 55 55)"/>`).join("");
    return svgVB(110, 110,
      `<g fill="#f59e0b">${rays}</g>` +
      `<circle cx="55" cy="55" r="30" fill="#fde68a"/><circle cx="55" cy="55" r="24" fill="#fbbf24"/>` +
      `<circle cx="47" cy="51" r="3.5" fill="#7c4a03"/><circle cx="63" cy="51" r="3.5" fill="#7c4a03"/>` +
      `<path d="M46 60q9 8 18 0" stroke="#7c4a03" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    );
  });
}

// Falling leaf — tumbles a full turn across the frames while swaying side to side.
function leafFrames(): string[] {
  const N = 8;
  return Array.from({ length: N }, (_, i) => {
    const rot = i * 45;
    const sx = Math.sin((i / N) * TAU) * 7;
    return svgVB(90, 100,
      `<g transform="translate(${r1(sx)} 0) rotate(${rot} 45 50)">` +
      `<path d="M45 8C18 24 14 64 38 92c2 2 6 2 8 0C72 64 72 24 45 8Z" fill="#ea580c"/>` +
      `<path d="M45 16L44 88" stroke="#9a3412" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<path d="M45 36L30 46M45 52L62 60M45 66L32 74" stroke="#9a3412" stroke-width="2" fill="none" stroke-linecap="round"/></g>`,
    );
  });
}

// Swimming fish — the tail fans and the top fin flicks.
function fishFrames(): string[] {
  const N = 6;
  return Array.from({ length: N }, (_, i) => {
    const tail = Math.sin((i / N) * TAU) * 18;
    const fin = Math.sin((i / N) * TAU + 1) * 7;
    return svgVB(120, 80,
      `<path d="M36 40L10 24l6 16-6 16z" fill="#f97316" transform="rotate(${r1(tail)} 36 40)"/>` +
      `<path d="M66 18q8 6 0 14z" fill="#f97316" transform="rotate(${r1(fin)} 66 25)"/>` +
      `<ellipse cx="70" cy="40" rx="34" ry="24" fill="#fb923c"/>` +
      `<ellipse cx="66" cy="46" rx="20" ry="12" fill="#ffedd5"/>` +
      `<circle cx="92" cy="34" r="5" fill="#fff"/><circle cx="93" cy="34" r="2.5" fill="#111"/>` +
      `<path d="M100 44q6 4 0 8" stroke="#ea580c" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      `<circle cx="110" cy="24" r="3" fill="#bae6fd"/>`,
    );
  });
}

// Bobbing boat — the hull rocks on scrolling waves.
function boatFrames(): string[] {
  const N = 6;
  return Array.from({ length: N }, (_, i) => {
    const ph = (i / N) * TAU;
    const tilt = Math.sin(ph) * 6;
    const wx = i * 4;
    return svgVB(120, 100,
      `<g transform="rotate(${r1(tilt)} 60 72)">` +
      `<path d="M58 18l14 5-14 5z" fill="#f59e0b"/><rect x="56" y="18" width="4" height="48" fill="#92400e"/>` +
      `<path d="M54 24L30 62h24z" fill="#fca5a5"/><path d="M62 24l28 38H62z" fill="#fff" stroke="#e5e7eb" stroke-width="2"/>` +
      `<path d="M26 64h68l-10 20H36z" fill="#ef4444" stroke="#b91c1c" stroke-width="2"/></g>` +
      `<path d="M${r1(-8 + (wx % 24))} 86q12-8 24 0t24 0t24 0t24 0t24 0t24 0" stroke="#38bdf8" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `<path d="M${r1(-8 + ((wx + 12) % 24))} 94q12-8 24 0t24 0t24 0t24 0t24 0t24 0" stroke="#7dd3fc" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    );
  });
}

// Twinkling star — pulses while a glint sweeps around it.
function starFrames(): string[] {
  const N = 6;
  return Array.from({ length: N }, (_, i) => {
    const ph = (i / N) * TAU;
    const s = 1 + 0.12 * Math.sin(ph);
    const gl = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(ph));
    const grot = i * 60;
    return svgVB(100, 100,
      `<g transform="translate(50 50) scale(${r1(s)}) translate(-50 -50)">` +
      `<path d="M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z" fill="#fbbf24" stroke="#f59e0b" stroke-width="3" stroke-linejoin="round"/></g>` +
      `<g transform="rotate(${grot} 82 20)" opacity="${r1(gl)}"><path d="M82 9l2.5 8.5 8.5 2.5-8.5 2.5-2.5 8.5-2.5-8.5-8.5-2.5 8.5-2.5z" fill="#fffbe6"/></g>`,
    );
  });
}

// Breeze — the gust lines flow to the right and fade.
function breezeFrames(): string[] {
  const N = 6;
  return Array.from({ length: N }, (_, i) => {
    const dx = (i / N) * 22;
    return svgVB(140, 80,
      `<path d="M${r1(8 + dx)} 26H86a10 10 0 1 0-10-10" fill="none" stroke="#60a5fa" stroke-width="6" stroke-linecap="round" opacity="${r1(1 - dx / 44)}"/>` +
      `<path d="M${r1(dx)} 48H112a11 11 0 1 1-11 11" fill="none" stroke="#93c5fd" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M${r1(14 + dx)} 66H72a8 8 0 1 0-8-8" fill="none" stroke="#bae6fd" stroke-width="5" stroke-linecap="round" opacity="${r1(1 - dx / 50)}"/>`,
    );
  });
}

// Hot-air balloon — floats up and down while the burner flame flickers.
function balloonFrames(): string[] {
  const N = 4;
  return Array.from({ length: N }, (_, i) => {
    const dy = [0, -4, 0, 4][i];
    const fh = [9, 13, 11, 6][i]; // flame flickers each frame (distinct even when the bob repeats)
    return svgVB(90, 120,
      `<g transform="translate(0 ${dy})">` +
      `<path d="M45 8C22 8 10 28 10 46C10 70 32 84 45 92C58 84 80 70 80 46C80 28 68 8 45 8Z" fill="#ef4444"/>` +
      `<path d="M45 8C35 10 30 30 30 50C30 68 38 82 45 92C52 82 60 68 60 50C60 30 55 10 45 8Z" fill="#f59e0b"/>` +
      `<path d="M45 8C41 10 40 30 40 50C40 70 43 84 45 92C47 84 50 70 50 50C50 30 49 10 45 8Z" fill="#fde047"/>` +
      `<path d="M34 86L40 103M56 86L50 103" stroke="#78350f" stroke-width="2"/>` +
      `<ellipse cx="45" cy="${r1(98)}" rx="4" ry="${fh}" fill="#fb923c"/>` +
      `<rect x="37" y="104" width="16" height="13" rx="2" fill="#92400e"/></g>`,
    );
  });
}

function frameSprite(id: string, label: string, w: number, h: number, frames: string[], fps = 8): SpriteDef {
  return { id, label, width: w, height: h, svg: frames[0], frames: frames.map(svgDataUrl), fps, enter: null };
}

export const SPRITE_ANIMATIONS: SpriteDef[] = [
  frameSprite("walking-panda", "Walking panda", 220, 183, pandaFrames(), 8),
  frameSprite("blooming-flower", "Blooming flower", 180, 198, flowerFrames(), 8),
  frameSprite("flapping-bird", "Flapping bird", 220, 160, birdFrames(), 10),
  frameSprite("spinning-sun", "Spinning sun", 200, 200, sunFrames(), 12),
  frameSprite("falling-leaf", "Falling leaf", 160, 178, leafFrames(), 8),
  frameSprite("swimming-fish", "Swimming fish", 240, 160, fishFrames(), 8),
  frameSprite("bobbing-boat", "Bobbing boat", 240, 200, boatFrames(), 8),
  frameSprite("twinkle-star", "Twinkling star", 170, 170, starFrames(), 8),
  frameSprite("breeze", "Breeze", 280, 160, breezeFrames(), 10),
  frameSprite("hot-air-balloon", "Hot-air balloon", 150, 200, balloonFrames(), 6),
];

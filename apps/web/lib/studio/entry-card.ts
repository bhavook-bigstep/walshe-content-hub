// Compose a catalog entry into a single "card" image — the visual you see when you open an entry
// in the catalog (hero photo + title + type/location + status), rasterised to a PNG data URL so it
// can be dragged onto the Design Studio canvas as one placeable image.

import type { Entry } from "../api";

const STATUS_LABELS: Record<string, string> = {
  approved: "Available",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  draft: "Draft",
  in_review: "In review",
  withdrawn: "Withdrawn",
};

const FONT = "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

/** Natural card size (4:5 portrait). Exported so callers can place with the right aspect. */
export const ENTRY_CARD = { width: 864, height: 1080, ratio: 864 / 1080 } as const;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Destination palettes for the procedural scene drawn when an entry has no cover photo. Picsum (the
// catalog's photo fallback) can't be rasterised here — it's cross-origin without CORS, which would
// taint the canvas — so we paint a stylised scene locally instead: always photo-led, never flat.
const SCENES: { sky: [string, string]; sun: string; hills: [string, string, string] }[] = [
  { sky: ["#1e3a8a", "#6366f1"], sun: "#fcd34d", hills: ["#0f172a", "#1e293b", "#334155"] }, // alpine dusk
  { sky: ["#fb923c", "#fde68a"], sun: "#fff7ed", hills: ["#7c2d12", "#9a3412", "#c2410c"] }, // coast sunset
  { sky: ["#6ee7b7", "#fef9c3"], sun: "#fef3c7", hills: ["#064e3b", "#065f46", "#047857"] }, // forest morning
  { sky: ["#fdba74", "#fef3c7"], sun: "#fffbeb", hills: ["#92400e", "#b45309", "#d97706"] }, // desert
  { sky: ["#99f6e4", "#ecfeff"], sun: "#ffffff", hills: ["#0f766e", "#115e59", "#14b8a6"] }, // ocean teal
];

// Paint a layered destination scene (sky gradient, glowing sun, three hill silhouettes).
function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const p = SCENES[seed % SCENES.length];

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, p.sky[0]);
  sky.addColorStop(1, p.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sun with a soft glow (position varies with the seed).
  const sx = W * (0.55 + ((seed >> 3) % 30) / 100);
  const sy = H * 0.26;
  const r = W * 0.16;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.4);
  glow.addColorStop(0, p.sun);
  glow.addColorStop(0.25, p.sun);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Three overlapping hill silhouettes, far (high) to near (low).
  for (let i = 0; i < 3; i++) {
    const baseY = H * (0.52 + i * 0.13);
    const amp = H * (0.06 + 0.03 * ((seed >> (i + 1)) % 3));
    const phase = ((seed >> (i * 2)) % 10) / 10;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, baseY);
    const segments = 6;
    for (let x = 0; x <= segments; x++) {
      const px = (x / segments) * W;
      const py = baseY - Math.sin((x / segments) * Math.PI * 1.5 + phase * Math.PI * 2 + i) * amp;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = p.hills[i];
    ctx.fill();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Greedy word-wrap against the current ctx font; returns at most `maxLines` lines (last ellipsised).
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1).trimEnd();
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/**
 * Render `entry` to a card PNG (data URL). When `coverSrc` is a same-origin blob URL it becomes the
 * hero; otherwise a branded gradient is used (so the result is never a tainted canvas). Falls back
 * to `coverSrc` (or "") if a 2D context isn't available.
 */
export async function composeEntryCard(entry: Entry, coverSrc?: string | null): Promise<string> {
  const W = ENTRY_CARD.width;
  const H = ENTRY_CARD.height;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return coverSrc ?? "";

  // ── Hero: cover photo (cover-fit) or a brand gradient ──
  let drewPhoto = false;
  if (coverSrc && coverSrc.startsWith("blob:")) {
    const img = await loadImage(coverSrc);
    if (img && img.width && img.height) {
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      drewPhoto = true;
    }
  }
  if (!drewPhoto) {
    // No cover asset → paint a stylised destination scene (varied per entry) so the card is always
    // photo-led, like the catalog, instead of a flat panel.
    drawScene(ctx, W, H, hash(entry.title || String(entry.id)));
  }

  // ── Bottom scrim for legible text ──
  const scrim = ctx.createLinearGradient(0, H * 0.4, 0, H);
  scrim.addColorStop(0, "rgba(11,18,22,0)");
  scrim.addColorStop(1, "rgba(11,18,22,0.92)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  const pad = 56;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // ── Status pill (top-left) ──
  const status = STATUS_LABELS[entry.display_status] ?? entry.display_status ?? "";
  if (status) {
    ctx.font = `700 24px ${FONT}`;
    const tw = ctx.measureText(status).width;
    const pw = tw + 36;
    const ph = 44;
    const expired = entry.display_status === "expired";
    ctx.fillStyle = expired ? "rgba(220,38,38,0.92)" : "rgba(255,255,255,0.92)";
    roundRect(ctx, pad, pad, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = expired ? "#fff" : "#0b1216";
    ctx.fillText(status, pad + 18, pad + 30);
  }

  // ── Title + eyebrow + facts, laid out from the bottom up ──
  const loc =
    [entry.city, entry.state, entry.country].filter(Boolean).join(", ") || entry.destination || "";

  // Facts line (season · expiry).
  const facts: string[] = [];
  if (entry.season) facts.push(entry.season.replace("_", "-"));
  facts.push(entry.expires_at ? `until ${new Date(entry.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "always on");

  let y = H - pad;

  // Facts (smallest, lowest).
  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(facts.join("   ·   "), pad, y);
  y -= 46;

  // Title (bold, up to 3 lines).
  ctx.font = `800 66px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  const titleLines = wrapLines(ctx, entry.title, W - pad * 2, 3);
  for (let i = titleLines.length - 1; i >= 0; i--) {
    ctx.fillText(titleLines[i], pad, y);
    y -= 76;
  }
  y -= 4;

  // Eyebrow (type · location).
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = "#5eead4";
  const eyebrow = `${(entry.type ?? "").toUpperCase()}${loc ? `   ·   ${loc}` : ""}`;
  ctx.fillText(eyebrow, pad, y);

  return canvas.toDataURL("image/png");
}

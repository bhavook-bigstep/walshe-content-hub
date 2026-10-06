"use client";

import type { CSSProperties } from "react";

// A loose view of a design node (templates send these as plain dicts from the API).
interface Node {
  type?: string;
  shape?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  lineHeight?: number;
  opacity?: number;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
}

interface Props {
  width: number;
  height: number;
  background?: string;
  nodes?: ReadonlyArray<Record<string, unknown>>;
  className?: string;
}

/**
 * A scaled, self-contained preview of a template's first scene. Positions are percentages of the
 * design and font sizes use `cqw` (container-query width), so the thumbnail scales to whatever box
 * it's dropped into with no JS. Images show as neutral frames (swapped for real photos in the studio).
 */
export default function TemplateThumb({ width, height, background, nodes, className = "" }: Props) {
  const W = width || 1080;
  const H = height || 1080;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: `${W} / ${H}`, background: background || "#ffffff", containerType: "inline-size" }}
      aria-hidden
    >
      {(nodes ?? []).map((raw, i) => {
        const n = raw as Node;
        const base: CSSProperties = {
          position: "absolute",
          left: pct(n.x ?? 0, W),
          top: pct(n.y ?? 0, H),
          width: pct(n.width ?? 0, W),
          height: pct(n.height ?? 0, H),
          opacity: n.opacity ?? 1,
        };
        if (n.type === "text") {
          return (
            <div
              key={i}
              style={{
                ...base,
                height: "auto",
                color: n.color ?? "#111111",
                fontSize: `${((n.fontSize ?? 48) / W) * 100}cqw`,
                fontFamily: n.fontFamily,
                fontWeight: n.fontWeight,
                fontStyle: n.fontStyle,
                textAlign: (n.textAlign as CSSProperties["textAlign"]) ?? "left",
                lineHeight: n.lineHeight ?? 1.16,
                overflow: "hidden",
              }}
            >
              {n.text}
            </div>
          );
        }
        if (n.type === "shape") {
          const border = n.stroke ? `${((n.strokeWidth ?? 2) / W) * 100}cqw solid ${n.stroke}` : undefined;
          if (n.shape === "ellipse") {
            return <div key={i} style={{ ...base, background: n.color, borderRadius: "50%", border }} />;
          }
          if (n.shape === "line") {
            return <div key={i} style={{ ...base, height: `${((n.strokeWidth ?? 4) / H) * 100}%`, background: n.stroke ?? n.color }} />;
          }
          return (
            <div
              key={i}
              style={{ ...base, background: n.color, border, borderRadius: `${((n.radius ?? 0) / W) * 100}cqw` }}
            />
          );
        }
        // image placeholder frame
        return (
          <div
            key={i}
            style={{ ...base, background: "#e2e8f0", borderRadius: `${((n.radius ?? 0) / W) * 100}cqw` }}
          />
        );
      })}
    </div>
  );
}

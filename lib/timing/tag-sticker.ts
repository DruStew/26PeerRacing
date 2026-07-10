import "server-only";

import * as opentype from "opentype.js";

import { LOGIK_FONT_BASE64, PR_LOGO_SVG } from "@/lib/checkpoints/assets.generated";

import { markerSvg, TAG_CAPACITY } from "./tags";

/**
 * Print-ready timing tag stickers: brand-colored ArUco marker (navy modules
 * on orange), the full-color PR logo, and the tag number set in the brand
 * font as outlined vector paths — fully self-contained SVG, no linked assets.
 *
 * Server-only because it pulls in opentype.js plus the embedded font/logo;
 * the client-side scanner only needs the lean helpers in ./tags.
 */

const NAVY = "#002F48";
const ORANGE = "#F26822";

let cachedFont: opentype.Font | null = null;
function brandFont(): opentype.Font {
  if (cachedFont) return cachedFont;
  const buf = Buffer.from(LOGIK_FONT_BASE64, "base64");
  cachedFont = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return cachedFont;
}

let cachedLogo: { inner: string; width: number; aspect: number } | null = null;
function brandLogo(): { inner: string; width: number; aspect: number } {
  if (cachedLogo) return cachedLogo;
  const raw = PR_LOGO_SVG;
  const viewBox = raw.match(/viewBox="([\d.\s-]+)"/)?.[1]?.split(/\s+/).map(Number);
  const vw = viewBox?.[2] ?? 1920;
  const vh = viewBox?.[3] ?? 986.85;
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  cachedLogo = { inner, width: vw, aspect: vw / vh };
  return cachedLogo;
}

/**
 * Serialize an opentype path ourselves — opentype.js's toPathData() has a
 * rounding bug that can emit literal "NaN" for some glyph/size combinations.
 */
function pathDataFromCommands(commands: opentype.PathCommand[]): string {
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  const parts: string[] = [];
  for (const c of commands) {
    if (c.type === "M") parts.push(`M${n(c.x)} ${n(c.y)}`);
    else if (c.type === "L") parts.push(`L${n(c.x)} ${n(c.y)}`);
    else if (c.type === "Q") parts.push(`Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`);
    else if (c.type === "C")
      parts.push(`C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`);
    else if (c.type === "Z") parts.push("Z");
  }
  return parts.join("");
}

/**
 * A complete print-ready sticker. Sized in inches via the svg width/height
 * attrs so print output is physically correct.
 */
export function stickerSvg(tagId: number, opts?: { widthIn?: number }): string {
  if (!Number.isInteger(tagId) || tagId < 0 || tagId >= TAG_CAPACITY) {
    throw new Error(`tag id out of range 0..${TAG_CAPACITY - 1}`);
  }

  const widthIn = opts?.widthIn ?? 3.5;
  // Layout in abstract units: 100 wide; marker on top, logo + tag # footer.
  const W = 100;
  const H = 116;
  const heightIn = (widthIn * H) / W;

  // Recolor the marker: dark modules navy, light modules (and the built-in
  // quiet zone, which the detector needs in the light color) orange.
  const marker = markerSvg(tagId)
    .replace(
      '<svg xmlns="http://www.w3.org/2000/svg"',
      '<svg x="8" y="6" width="84" height="84"',
    )
    .replace(/fill="black"/g, `fill="${NAVY}"`)
    .replace(/fill="white"/g, `fill="${ORANGE}"`);

  // Footer: full-color PR logo on the left, tag number on the right.
  const logo = brandLogo();
  const logoH = 15;
  const logoW = logoH * logo.aspect;
  const logoX = 8;
  const logoY = 95;

  const font = brandFont();
  const label = String(tagId).padStart(3, "0");
  const textSize = 15;
  const textWidth = font.getAdvanceWidth(label, textSize);
  const textX = 92 - textWidth;
  const textBaseline = logoY + logoH / 2 + textSize * 0.36;
  const textPath = pathDataFromCommands(font.getPath(label, textX, textBaseline, textSize).commands);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthIn}in" height="${heightIn.toFixed(3)}in" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`,
    marker,
    `<g transform="translate(${logoX} ${logoY}) scale(${(logoW / logo.width).toFixed(6)})">${logo.inner}</g>`,
    `<path d="${textPath}" fill="${NAVY}"/>`,
    `</svg>`,
  ].join("");
}

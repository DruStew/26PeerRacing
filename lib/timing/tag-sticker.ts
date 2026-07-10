import "server-only";

import * as opentype from "opentype.js";

import { LOGIK_FONT_BASE64, PR_LOGO_SVG } from "@/lib/checkpoints/assets.generated";

import { markerSvg, TAG_CAPACITY } from "./tags";

/**
 * Print-ready timing tag stickers sized for the Avery 5164/8164/5523 family:
 * 4in x 3-1/3in, six per letter sheet. Black-and-white by design — maximum
 * camera contrast and prints on anything, including mono laser printers.
 *
 * Layout: marker on the left, PR logo (solid black) and tag number (brand
 * font, outlined to vector paths) stacked on the right. Fully self-contained
 * SVG — no linked fonts or images.
 *
 * Server-only because it pulls in opentype.js plus the embedded font/logo;
 * the client-side scanner only needs the lean helpers in ./tags.
 */

export const STICKER_WIDTH_IN = 4;
export const STICKER_HEIGHT_IN = 10 / 3;

let cachedFont: opentype.Font | null = null;
function brandFont(): opentype.Font {
  if (cachedFont) return cachedFont;
  const buf = Buffer.from(LOGIK_FONT_BASE64, "base64");
  cachedFont = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return cachedFont;
}

let cachedLogo: { inner: string; width: number; aspect: number } | null = null;
/** PR logo recolored to solid black (its brand colors live in a <style> block). */
function blackLogo(): { inner: string; width: number; aspect: number } {
  if (cachedLogo) return cachedLogo;
  const raw = PR_LOGO_SVG.replace(/#f26822/gi, "#000000").replace(/#002f48/gi, "#000000");
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
 * One Avery 5164 label (4in x 3-1/3in). Coordinate space is 120x100 units,
 * i.e. 30 units per inch.
 */
export function stickerSvg(tagId: number): string {
  if (!Number.isInteger(tagId) || tagId < 0 || tagId >= TAG_CAPACITY) {
    throw new Error(`tag id out of range 0..${TAG_CAPACITY - 1}`);
  }

  const W = 120;
  const H = 100;

  // Marker fills the left side: 84 units = 2.8in square (quiet zone included).
  const markerSize = 84;
  const markerX = 5;
  const markerY = (H - markerSize) / 2;
  const marker = markerSvg(tagId).replace(
    '<svg xmlns="http://www.w3.org/2000/svg"',
    `<svg x="${markerX}" y="${markerY}" width="${markerSize}" height="${markerSize}"`,
  );

  // Right column: logo over tag number, vertically centered as a block.
  const colX = markerX + markerSize + 4;
  const colW = W - colX - 4;

  const logo = blackLogo();
  const logoW = colW;
  const logoH = logoW / logo.aspect;

  const font = brandFont();
  const label = String(tagId).padStart(3, "0");
  let textSize = 16;
  const widthAt = (s: number) => font.getAdvanceWidth(label, s);
  if (widthAt(textSize) > colW) textSize = (textSize * colW) / widthAt(textSize);
  const textW = widthAt(textSize);
  const capH = textSize * 0.72;

  const gap = 6;
  const blockH = logoH + gap + capH;
  const logoY = (H - blockH) / 2;
  const textBaseline = logoY + logoH + gap + capH;
  const textX = colX + (colW - textW) / 2;
  const textPath = pathDataFromCommands(font.getPath(label, textX, textBaseline, textSize).commands);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${STICKER_WIDTH_IN}in" height="${STICKER_HEIGHT_IN.toFixed(4)}in" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`,
    marker,
    `<g transform="translate(${colX} ${logoY.toFixed(2)}) scale(${(logoW / logo.width).toFixed(6)})">${logo.inner}</g>`,
    `<path d="${textPath}" fill="#000000"/>`,
    `</svg>`,
  ].join("");
}

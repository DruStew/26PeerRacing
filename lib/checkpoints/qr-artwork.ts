import "server-only";

import fs from "node:fs";
import path from "node:path";

import * as opentype from "opentype.js";
import QRCode from "qrcode";

/**
 * Print-ready QR checkpoint signs.
 *
 * The SVG output is a fully self-contained vector file: all text is converted
 * to outlines (paths) with the brand font's glyph data, and the Peer Racing
 * logo's vector paths are embedded inline. No fonts or linked images — it
 * opens identically in Illustrator/print shops and scales infinitely.
 *
 * QR codes are generated at error-correction level H (~30% recoverable), and
 * the center logo knockout covers well under 10% of the code, so scans stay
 * reliable even printed small or weathered.
 */

const NAVY = "#002F48";
const ORANGE = "#F26822";

// Card canvas (arbitrary vector units; PNG renders at 3000px wide ≈ 10in @300dpi).
const W = 1200;
const H = 1560;
const CONTENT_W = 1000;

let cachedFont: opentype.Font | null = null;
function brandFont(): opentype.Font {
  if (cachedFont) return cachedFont;
  const file = path.join(process.cwd(), "public", "Font", "Logik-ExtendedBoldOblique.ttf");
  const buf = fs.readFileSync(file);
  cachedFont = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return cachedFont;
}

let cachedLogo: { inner: string; aspect: number } | null = null;
function brandLogo(): { inner: string; aspect: number } {
  if (cachedLogo) return cachedLogo;
  const file = path.join(process.cwd(), "public", "PR_primarylogo.svg");
  const raw = fs.readFileSync(file, "utf8");
  const viewBox = raw.match(/viewBox="([\d.\s-]+)"/)?.[1]?.split(/\s+/).map(Number);
  const vw = viewBox?.[2] ?? 1920;
  const vh = viewBox?.[3] ?? 986.85;
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  cachedLogo = { inner, aspect: vw / vh };
  return cachedLogo;
}

/**
 * Serialize an opentype path ourselves — opentype.js's toPathData() has a
 * rounding bug that can emit literal "NaN" into the output for some
 * glyph/size combinations.
 */
function pathDataFromCommands(commands: opentype.PathCommand[]): string {
  const n = (v: number) => String(Math.round(v * 100) / 100);
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

/** Text as outlined vector path, centered horizontally, sized to fit maxWidth. */
function outlinedText(opts: {
  text: string;
  baselineY: number;
  size: number;
  maxWidth: number;
  fill: string;
  letterSpacingEm?: number;
}): { path: string; size: number } {
  const font = brandFont();
  const text = opts.text;
  const spacing = opts.letterSpacingEm ?? 0;

  const widthAt = (size: number) =>
    font.getAdvanceWidth(text, size) + spacing * size * Math.max(0, text.length - 1);

  let size = opts.size;
  const w = widthAt(size);
  if (w > opts.maxWidth) size = (size * opts.maxWidth) / w;

  const finalWidth = widthAt(size);
  const x = (W - finalWidth) / 2;
  const p = font.getPath(text, x, opts.baselineY, size, {
    letterSpacing: spacing,
    // opentype's letterSpacing option is in em units.
  } as opentype.RenderOptions);
  const d = pathDataFromCommands(p.commands);
  return { path: `<path d="${d}" fill="${opts.fill}"/>`, size };
}

/** QR dark modules as one compact path (horizontal run-length merged). */
function qrModulesPath(url: string): { d: string; moduleCount: number } {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const data = qr.modules.data as Uint8Array;
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (data[y * size + x]) {
        let run = 1;
        while (x + run < size && data[y * size + x + run]) run++;
        parts.push(`M${x} ${y}h${run}v1h-${run}z`);
        x += run;
      } else {
        x++;
      }
    }
  }
  return { d: parts.join(""), moduleCount: size };
}

export type CheckpointArtworkInput = {
  url: string;
  eventName: string;
  distanceLabel: string;
  checkpointNumber: number;
  checkpointName: string;
};

export function renderCheckpointSvg(input: CheckpointArtworkInput): string {
  const pieces: string[] = [];

  // Frame
  pieces.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  pieces.push(
    `<rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="20" fill="none" stroke="${NAVY}" stroke-width="5"/>`,
  );
  pieces.push(`<rect x="28" y="${H - 96}" width="${W - 56}" height="68" rx="0" fill="${ORANGE}"/>`);
  // Round only the bottom corners of the footer bar by overlaying the frame's radius.
  pieces.push(
    `<rect x="28" y="${H - 96}" width="${W - 56}" height="68" rx="18" fill="${ORANGE}"/>`,
  );

  // Event name (up to two lines if very long is out of scope — shrink to fit).
  pieces.push(
    outlinedText({
      text: input.eventName.toUpperCase(),
      baselineY: 150,
      size: 78,
      maxWidth: CONTENT_W,
      fill: NAVY,
    }).path,
  );

  // Distance
  pieces.push(
    outlinedText({
      text: input.distanceLabel.toUpperCase(),
      baselineY: 228,
      size: 50,
      maxWidth: CONTENT_W,
      fill: ORANGE,
    }).path,
  );

  // QR code
  const { d, moduleCount } = qrModulesPath(input.url);
  const qrSize = 700;
  const qrX = (W - qrSize) / 2;
  const qrY = 292;
  const scale = qrSize / moduleCount;
  pieces.push(
    `<g transform="translate(${qrX} ${qrY}) scale(${scale.toFixed(5)})"><path d="${d}" fill="${NAVY}"/></g>`,
  );

  // Center logo knockout (white box + embedded vector logo, ~5% of code area).
  const logo = brandLogo();
  const logoW = 230;
  const logoH = logoW / logo.aspect;
  const padX = 22;
  const padY = 18;
  const boxW = logoW + padX * 2;
  const boxH = logoH + padY * 2;
  const cx = W / 2;
  const cy = qrY + qrSize / 2;
  pieces.push(
    `<rect x="${cx - boxW / 2}" y="${cy - boxH / 2}" width="${boxW}" height="${boxH}" rx="14" fill="#ffffff"/>`,
  );
  pieces.push(
    `<g transform="translate(${cx - logoW / 2} ${cy - logoH / 2}) scale(${(logoW / 1920).toFixed(6)})">${logo.inner}</g>`,
  );

  // Checkpoint identity
  pieces.push(
    outlinedText({
      text: `CHECKPOINT ${input.checkpointNumber}`,
      baselineY: 1120,
      size: 66,
      maxWidth: CONTENT_W,
      fill: ORANGE,
    }).path,
  );
  pieces.push(
    outlinedText({
      text: input.checkpointName.toUpperCase(),
      baselineY: 1204,
      size: 54,
      maxWidth: CONTENT_W,
      fill: NAVY,
    }).path,
  );

  // Runner-facing CTA
  pieces.push(
    outlinedText({
      text: "SCAN WITH YOUR PHONE CAMERA",
      baselineY: 1316,
      size: 34,
      maxWidth: CONTENT_W,
      fill: NAVY,
    }).path,
  );
  pieces.push(
    outlinedText({
      text: "FOR THE STORY OF THIS SPOT",
      baselineY: 1362,
      size: 34,
      maxWidth: CONTENT_W,
      fill: NAVY,
    }).path,
  );

  // Footer wordmark on the orange bar
  pieces.push(
    outlinedText({
      text: "PEERRACING.COM",
      baselineY: H - 50,
      size: 30,
      maxWidth: CONTENT_W,
      fill: "#ffffff",
    }).path,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${pieces.join("")}</svg>`;
}

export async function renderCheckpointPng(svg: string): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 3000 },
    background: "white",
  });
  return Buffer.from(resvg.render().asPng());
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "x"
  );
}

/** e.g. black-hills-100_100-miles_checkpoint-03-dalton-summit */
export function checkpointFileBase(
  eventName: string,
  distanceLabel: string,
  checkpointNumber: number,
  checkpointName: string,
): string {
  const num = String(checkpointNumber).padStart(2, "0");
  return `${slug(eventName)}_${slug(distanceLabel)}_checkpoint-${num}-${slug(checkpointName)}`;
}

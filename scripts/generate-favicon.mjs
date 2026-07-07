// Generate the site icons (favicon.ico, icon.png, apple-icon.png) from the
// PR primary logo SVG. Uses headless Chromium so the SVG renders exactly as
// browsers see it. Usage: node scripts/generate-favicon.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const svg = fs.readFileSync("public/PR_primarylogo.svg", "utf8");
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

const out = await page.evaluate(async (src) => {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("SVG failed to load"));
    img.src = src;
  });

  // Render large, then find the tight bounding box of the artwork.
  const W = 1920;
  const H = Math.round((W * img.naturalHeight) / img.naturalWidth);
  const base = document.createElement("canvas");
  base.width = W;
  base.height = H;
  const bctx = base.getContext("2d");
  bctx.drawImage(img, 0, 0, W, H);
  const data = bctx.getImageData(0, 0, W, H).data;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  function renderSquare(size, pad, bg) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
    }
    const avail = size - pad * 2;
    const scale = Math.min(avail / bw, avail / bh);
    const dw = bw * scale;
    const dh = bh * scale;
    ctx.drawImage(base, minX, minY, bw, bh, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return c.toDataURL("image/png");
  }

  return {
    icon512: renderSquare(512, 12, null),
    icon64: renderSquare(64, 2, null),
    icon32: renderSquare(32, 1, null),
    apple: renderSquare(180, 16, "#eef1f4"), // iOS dislikes transparency
  };
}, dataUrl);

await browser.close();

const png = (u) => Buffer.from(u.split(",")[1], "base64");

/** Single-image ICO wrapping a PNG (supported by all modern browsers). */
function icoFromPngs(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dirs = [];
  const bodies = [];
  let offset = 6 + entries.length * 16;
  for (const { size, buf } of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0);
    e.writeUInt8(size === 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    dirs.push(e);
    bodies.push(buf);
  }
  return Buffer.concat([header, ...dirs, ...bodies]);
}

fs.writeFileSync("app/icon.png", png(out.icon512));
fs.writeFileSync("app/apple-icon.png", png(out.apple));
fs.writeFileSync(
  "app/favicon.ico",
  icoFromPngs([
    { size: 32, buf: png(out.icon32) },
    { size: 64, buf: png(out.icon64) },
  ]),
);
console.log("Wrote app/icon.png, app/apple-icon.png, app/favicon.ico");

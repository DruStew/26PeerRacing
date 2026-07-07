// Dev-only: screenshot the share-card canvases from /dev/share-cards so the
// layout can be checked without a phone. Usage: node scripts/screenshot-share-cards.mjs [baseUrl]
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const outDir = "scripts/test-race/out";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
await page.goto(`${base}/dev/share-cards`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // font + badge images + render passes

const canvases = page.locator("canvas");
const n = await canvases.count();
console.log(`Found ${n} canvases`);

for (let i = 0; i < n; i++) {
  const dataUrl = await canvases
    .nth(i)
    .evaluate((c) => c.toDataURL("image/png"));
  const b64 = dataUrl.split(",")[1];
  const file = `${outDir}/share-card-${i}.png`;
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  console.log(`Wrote ${file}`);
}

// Toggle each studio to 4:5 and capture again
const buttons = page.getByRole("button", { name: "Feed 4:5" });
const bn = await buttons.count();
for (let i = 0; i < bn; i++) await buttons.nth(i).click();
await page.waitForTimeout(1500);
for (let i = 0; i < n; i++) {
  const dataUrl = await canvases.nth(i).evaluate((c) => c.toDataURL("image/png"));
  const b64 = dataUrl.split(",")[1];
  const file = `${outDir}/share-card-${i}-feed.png`;
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  console.log(`Wrote ${file}`);
}

await browser.close();

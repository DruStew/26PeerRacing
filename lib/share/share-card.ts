"use client";

/**
 * Racer share graphics — rendered entirely in the browser on a <canvas>.
 *
 * Trading-card style frame themed to the racer's division color (Alpha red,
 * Bravo blue, Charlie green, Delta orange, Echo purple; PR orange when there
 * is no division). Layout: header bar with event + distance ribbon, angled
 * white name plate, division badge top-right, icon stat plates bottom-left,
 * money plates bottom-right, sponsor footer rail.
 *
 * Two card kinds:
 *  - "raceday": posted at check-in — IT'S RACE DAY! ribbon, no stats.
 *  - "finish":  posted when results publish — time, places, pools, money.
 *
 * The racer's photo fills the window behind the frame (cover-cropped);
 * without a photo we paint a branded navy background with the PR logo.
 * Output sizes: 1080×1920 (9:16 story) and 1080×1350 (4:5 feed).
 */

export type ShareAspect = "9:16" | "4:5";

export type ShareMoneyLine = { label: string; amountText: string };

export type ShareCardData =
  | {
      kind: "raceday";
      eventName: string;
      distanceLabel: string;
      runnerName?: string | null;
      sponsorLogoUrl?: string | null;
    }
  | {
      kind: "finish";
      eventName: string;
      distanceLabel: string;
      runnerName?: string | null;
      timeText: string | null;
      division: string | null;
      divisionPlaceText: string | null; // "1ST"
      overallText: string | null; // "3RD OF 58 OVERALL"
      femalePoolText: string | null; // "2ND FEMALE POOL · $180.00"
      militaryPoolText: string | null; // "1ST MILITARY POOL · $240.00"
      moneyLines: ShareMoneyLine[];
      totalWonText: string | null; // "$1,325.54"
      sponsorLogoUrl?: string | null;
    };

const NAVY = "#0B2740";
const NAVY_DEEP = "#071B2E";

/** Accent colors sampled from the official division badge artwork. */
const DIVISION_THEMES: Record<string, { base: string; dark: string; light: string }> = {
  Alpha: { base: "#E8252B", dark: "#9E1418", light: "#F6A3A5" },
  Bravo: { base: "#3FA9F5", dark: "#1F6FA8", light: "#B5DDFB" },
  Charlie: { base: "#52D726", dark: "#2F8A14", light: "#BDF0A8" },
  Delta: { base: "#F28C28", dark: "#A85B12", light: "#F9D0A3" },
  Echo: { base: "#A937F2", dark: "#6E1FA6", light: "#DDB3FA" },
};
const PR_THEME = { base: "#F26822", dark: "#B94E15", light: "#FBC5A3" };

const BADGE_SRC: Record<string, string> = {
  Alpha: "/PNG_1000px/PR_Alpha_1000.png",
  Bravo: "/PNG_1000px/PR_Bravo_1000.png",
  Charlie: "/PNG_1000px/PR_Charlie_1000.png",
  Delta: "/PNG_1000px/PR_Delta_1000.png",
  Echo: "/PNG_1000px/PR_Echo_1000.png",
};

let fontReady: Promise<void> | null = null;
export function loadShareFont(): Promise<void> {
  if (!fontReady) {
    fontReady = (async () => {
      const face = new FontFace("LogikShare", "url(/Font/Logik-ExtendedBoldOblique.ttf)");
      await face.load();
      document.fonts.add(face);
    })();
  }
  return fontReady;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width?: number; height?: number },
  w: number,
  h: number,
) {
  const iw = (img as HTMLImageElement).naturalWidth ?? (img.width as number);
  const ih = (img as HTMLImageElement).naturalHeight ?? (img.height as number);
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img as CanvasImageSource, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function font(px: number): string {
  return `${px}px LogikShare, sans-serif`;
}

/** Shrink font size until the text fits maxWidth. Returns the fitted px. */
function fitText(ctx: CanvasRenderingContext2D, text: string, basePx: number, maxWidth: number): number {
  let px = basePx;
  ctx.font = font(px);
  const w = ctx.measureText(text).width;
  if (w > maxWidth) px = Math.floor((basePx * maxWidth) / w);
  ctx.font = font(px);
  return px;
}

/** Parallelogram leaning right (top edge shifted +skew px). */
function paraPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  skew: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + w + skew, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

/** Branded background when the racer skips the photo. */
function drawNoPhotoBackground(ctx: CanvasRenderingContext2D, w: number, h: number, logo: HTMLImageElement) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0d4666");
  g.addColorStop(0.55, "#0a3652");
  g.addColorStop(1, "#062338");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Diagonal speed stripes
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.32);
  const stripes: Array<[number, number, string]> = [
    [-h, 90, "rgba(242,104,34,0.14)"],
    [-h + 150, 34, "rgba(242,104,34,0.26)"],
    [h * 0.1, 120, "rgba(255,255,255,0.05)"],
    [h * 0.28, 46, "rgba(242,104,34,0.2)"],
  ];
  for (const [y, sh, color] of stripes) {
    ctx.fillStyle = color;
    ctx.fillRect(-w * 1.5, y, w * 3, sh);
  }
  ctx.restore();

  // Big PR logo in the middle of the photo window
  const logoW = w * 0.56;
  const logoH = (logoW / logo.naturalWidth) * logo.naturalHeight;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 60;
  ctx.drawImage(logo, (w - logoW) / 2, h * 0.36, logoW, logoH);
  ctx.restore();
}

type StatIcon = "time" | "trophy" | "flag" | "female" | "military";

/** Simple white vector icons, centered in a box of size s at (cx, cy). */
function drawIcon(ctx: CanvasRenderingContext2D, icon: StatIcon, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = s * 0.075;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (icon === "time") {
    const r = s * 0.27;
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.04, r, 0, Math.PI * 2);
    ctx.stroke();
    // crown + hand
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.04 - r);
    ctx.lineTo(cx, cy - s * 0.38);
    ctx.moveTo(cx - s * 0.1, cy - s * 0.38);
    ctx.lineTo(cx + s * 0.1, cy - s * 0.38);
    ctx.moveTo(cx, cy + s * 0.04);
    ctx.lineTo(cx + r * 0.55, cy - r * 0.35);
    ctx.stroke();
  } else if (icon === "trophy") {
    const top = cy - s * 0.34;
    // bowl: cup tapering to a rounded bottom
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.24, top);
    ctx.lineTo(cx + s * 0.24, top);
    ctx.lineTo(cx + s * 0.17, top + s * 0.26);
    ctx.quadraticCurveTo(cx, top + s * 0.42, cx - s * 0.17, top + s * 0.26);
    ctx.closePath();
    ctx.fill();
    // stem + base
    ctx.fillRect(cx - s * 0.04, top + s * 0.36, s * 0.08, s * 0.14);
    ctx.fillRect(cx - s * 0.17, top + s * 0.5, s * 0.34, s * 0.09);
  } else if (icon === "flag") {
    // pole
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.24, cy - s * 0.36);
    ctx.lineTo(cx - s * 0.24, cy + s * 0.38);
    ctx.stroke();
    // checkered flag (3×2 grid)
    const fw = s * 0.5;
    const fh = s * 0.34;
    const fx = cx - s * 0.24;
    const fy = cy - s * 0.36;
    const cwc = fw / 3;
    const chc = fh / 2;
    ctx.strokeRect(fx, fy, fw, fh);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        if ((r + c) % 2 === 0) ctx.fillRect(fx + c * cwc, fy + r * chc, cwc, chc);
      }
    }
  } else if (icon === "female") {
    const r = s * 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.12, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.12 + r);
    ctx.lineTo(cx, cy + s * 0.36);
    ctx.moveTo(cx - s * 0.13, cy + s * 0.22);
    ctx.lineTo(cx + s * 0.13, cy + s * 0.22);
    ctx.stroke();
  } else if (icon === "military") {
    // three chevrons
    for (let k = 0; k < 3; k++) {
      const yy = cy - s * 0.22 + k * s * 0.19;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22, yy + s * 0.11);
      ctx.lineTo(cx, yy - s * 0.05);
      ctx.lineTo(cx + s * 0.22, yy + s * 0.11);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** "3RD OF 58 OVERALL" → { value: "3RD", label: "OF 58 OVERALL" } */
function splitStat(text: string): { value: string; label: string } {
  const i = text.indexOf(" ");
  if (i === -1) return { value: text, label: "" };
  return { value: text.slice(0, i), label: text.slice(i + 1) };
}

type StatRow = { icon: StatIcon; label: string; value: string };

export async function renderShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  photo: HTMLImageElement | ImageBitmap | null,
  aspect: ShareAspect,
): Promise<void> {
  await loadShareFont();
  const W = 1080;
  const H = aspect === "9:16" ? 1920 : 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  const theme =
    data.kind === "finish" && data.division && DIVISION_THEMES[data.division]
      ? DIVISION_THEMES[data.division]
      : PR_THEME;

  const logo = await loadImage("/PR_primarylogo.svg");
  const greyLogo = await loadImage("/PR_primarylogo_grey.svg").catch(() => logo);
  const badgeImg =
    data.kind === "finish" && data.division && BADGE_SRC[data.division]
      ? await loadImage(BADGE_SRC[data.division])
      : null;
  const sponsorImg = data.sponsorLogoUrl ? await loadImage(data.sponsorLogoUrl).catch(() => null) : null;

  // ---- photo window ------------------------------------------------------
  if (photo) {
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, W, H);
    drawCover(ctx, photo as HTMLImageElement, W, H);
  } else {
    drawNoPhotoBackground(ctx, W, H, logo);
  }

  const SKEW = 24;
  ctx.textBaseline = "alphabetic";

  // ---- side + bottom rails ------------------------------------------------
  const railW = 20;
  const footerH = 64;
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, railW, H);
  ctx.fillRect(W - railW, 0, railW, H);
  ctx.fillStyle = theme.base;
  ctx.fillRect(railW, 0, 5, H);
  ctx.fillRect(W - railW - 5, 0, 5, H);

  // ---- header ----------------------------------------------------------------
  // Light grey bar so the full-color PR logo (orange + navy) leads the card.
  const headerH = 168;
  ctx.fillStyle = "#eef1f4";
  ctx.fillRect(0, 0, W, headerH);
  // accent bottom edge
  ctx.fillStyle = theme.base;
  ctx.fillRect(0, headerH, W, 5);

  // Full-color PR logo, big and left
  const hLogoH = 122;
  const hLogoW = (hLogoH / logo.naturalHeight) * logo.naturalWidth;
  ctx.drawImage(logo, 44, (headerH - hLogoH) / 2, hLogoW, hLogoH);

  // Event name in navy on the light bar
  const evX = 44 + hLogoW + 44;
  ctx.fillStyle = NAVY;
  fitText(ctx, data.eventName.toUpperCase(), 62, W - evX - 48);
  ctx.fillText(data.eventName.toUpperCase(), evX, headerH / 2 + 24);

  // Distance ribbon under the header (accent parallelogram + hazard slashes)
  const ribbonH = 66;
  const ribbonY = headerH + 5;
  ctx.font = font(38);
  const distText = data.distanceLabel.toUpperCase();
  const ribbonW = ctx.measureText(distText).width + 76;
  const ribbonX = evX - 20;
  paraPath(ctx, ribbonX, ribbonY, ribbonW, ribbonH, SKEW);
  ctx.fillStyle = theme.base;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(distText, ribbonX + 38 + SKEW / 2, ribbonY + ribbonH / 2 + 14);
  // hazard slashes to the right of the ribbon
  for (let k = 0; k < 4; k++) {
    paraPath(ctx, ribbonX + ribbonW + 26 + k * 34, ribbonY, 16, ribbonH, SKEW);
    ctx.fillStyle = k % 2 === 0 ? theme.base : theme.dark;
    ctx.fill();
  }

  // ---- footer rail ----------------------------------------------------------
  const footerY = H - footerH;
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, footerY, W, footerH);
  ctx.fillStyle = theme.base;
  ctx.fillRect(0, footerY - 5, W, 5);
  const fLogoH = 40;
  const fLogoW = (fLogoH / greyLogo.naturalHeight) * greyLogo.naturalWidth;
  ctx.drawImage(greyLogo, 44, footerY + (footerH - fLogoH) / 2, fLogoW, fLogoH);
  if (sponsorImg) {
    const label = "PR RESULTS POWERED BY";
    ctx.font = font(19);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const sLogoH = 42;
    let sLogoW = (sLogoH / sponsorImg.naturalHeight) * sponsorImg.naturalWidth;
    let sLogoHFit = sLogoH;
    if (sLogoW > 220) {
      sLogoW = 220;
      sLogoHFit = (sLogoW / sponsorImg.naturalWidth) * sponsorImg.naturalHeight;
    }
    const labelW = ctx.measureText(label).width;
    ctx.fillText(label, W - 44 - sLogoW - 18 - labelW, footerY + footerH / 2 + 7);
    ctx.drawImage(sponsorImg, W - 44 - sLogoW, footerY + (footerH - sLogoHFit) / 2, sLogoW, sLogoHFit);
  } else {
    ctx.font = font(23);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const t = "PEERRACING.COM";
    ctx.fillText(t, W - 44 - ctx.measureText(t).width, footerY + footerH / 2 + 8);
  }

  // ---- name plate (angled white) --------------------------------------------
  const nameY = ribbonY + ribbonH + 42;
  const first = (data.runnerName ?? "").trim().split(/\s+/)[0] ?? "";
  const rest = (data.runnerName ?? "").trim().split(/\s+/).slice(1).join(" ");
  if (data.runnerName) {
    ctx.font = font(44);
    const firstW = ctx.measureText(first.toUpperCase()).width;
    ctx.font = font(60);
    const lastW = ctx.measureText((rest || first).toUpperCase()).width;
    const plateW = Math.min(W * 0.66, Math.max(firstW, lastW) + 110);
    const plateH = rest ? 158 : 108;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 8;
    paraPath(ctx, 36, nameY, plateW, plateH, SKEW);
    ctx.fillStyle = "#f4f6f8";
    ctx.fill();
    ctx.restore();
    // accent bar inside the plate
    paraPath(ctx, 36 + 26, nameY + 20, 10, plateH - 40, ((plateH - 40) / plateH) * SKEW * 0.8);
    ctx.fillStyle = theme.base;
    ctx.fill();
    const textX = 36 + 62 + SKEW / 2;
    if (rest) {
      ctx.fillStyle = NAVY;
      ctx.font = font(44);
      ctx.fillText(first.toUpperCase(), textX, nameY + 62);
      ctx.fillStyle = theme.base;
      fitText(ctx, rest.toUpperCase(), 60, plateW - 100);
      ctx.fillText(rest.toUpperCase(), textX, nameY + 130);
    } else {
      ctx.fillStyle = NAVY;
      fitText(ctx, first.toUpperCase(), 54, plateW - 100);
      ctx.fillText(first.toUpperCase(), textX, nameY + 70);
    }
  }

  // ---- division badge (top-right, floating) ---------------------------------
  if (badgeImg) {
    const bW = 320;
    const bH = (bW / badgeImg.naturalWidth) * badgeImg.naturalHeight;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(badgeImg, W - railW - 24 - bW, headerH + 40, bW, bH);
    ctx.restore();
  }

  if (data.kind === "raceday") {
    // ---- big "IT'S RACE DAY!" ribbon ---------------------------------------
    const ribY = Math.round(H * 0.72);
    const text = "IT'S RACE DAY!";
    ctx.font = font(92);
    let tw = ctx.measureText(text).width;
    if (tw > W - 200) {
      fitText(ctx, text, 92, W - 200);
      tw = ctx.measureText(text).width;
    }
    const rw = tw + 120;
    const rh = 132;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    paraPath(ctx, 36, ribY, rw, rh, SKEW * 1.4);
    ctx.fillStyle = theme.base;
    ctx.fill();
    ctx.restore();
    paraPath(ctx, 36, ribY + rh + 12, rw * 0.55, 18, SKEW * 0.5);
    ctx.fillStyle = NAVY;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 36 + 60 + SKEW * 0.7, ribY + rh / 2 + 32);
    return;
  }

  // ---- finish card: stat plates (bottom-left) --------------------------------
  const rows: StatRow[] = [];
  if (data.timeText) rows.push({ icon: "time", label: "FINISH TIME", value: data.timeText });
  if (data.division && data.divisionPlaceText) {
    const money = data.moneyLines[0]?.amountText;
    rows.push({
      icon: "trophy",
      label: `${data.division.toUpperCase()} DIVISION${money ? ` · ${money}` : ""}`,
      value: data.divisionPlaceText,
    });
  }
  if (data.overallText) {
    const s = splitStat(data.overallText);
    rows.push({ icon: "flag", label: s.label || "OVERALL", value: s.value });
  }
  if (data.femalePoolText) {
    const s = splitStat(data.femalePoolText);
    rows.push({ icon: "female", label: s.label, value: s.value });
  }
  if (data.militaryPoolText) {
    const s = splitStat(data.militaryPoolText);
    rows.push({ icon: "military", label: s.label, value: s.value });
  }

  const rowH = 94;
  const rowGap = 16;
  const iconBox = 94;
  const stackBottom = footerY - 30;
  const stackTop = stackBottom - rows.length * rowH - (rows.length - 1) * rowGap;

  // Money plate geometry first, so stat plates can stay clear of it.
  const rightEdge = W - railW - 20;
  let moneyLeft = W; // left edge of the money plates (nothing there if no money)
  let moneyTop = H;
  const labelH = 56;
  const bigH = 132;
  if (data.totalWonText) {
    ctx.font = font(96);
    const bigW = Math.min(W * 0.55, ctx.measureText(data.totalWonText).width + 110);
    ctx.font = font(28);
    const labelPlateW = ctx.measureText("TOTAL MONEY WON").width + 76;
    moneyLeft = rightEdge - Math.max(bigW, labelPlateW);
    moneyTop = footerY - 30 - bigH - labelH - 10;
  }

  rows.forEach((row, i) => {
    const y = stackTop + i * (rowH + rowGap);
    const clearsMoney = y + rowH < moneyTop - 12;
    const maxPlateW = (clearsMoney ? W * 0.62 + 36 + iconBox + 12 : moneyLeft - 24) - (36 + iconBox + 12);
    // icon box
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    paraPath(ctx, 36, y, iconBox, rowH, SKEW * 0.9);
    ctx.fillStyle = theme.base;
    ctx.fill();
    ctx.restore();
    drawIcon(ctx, row.icon, 36 + iconBox / 2 + SKEW * 0.45, y + rowH / 2, iconBox);
    // text plate
    ctx.font = font(23);
    const labelW = ctx.measureText(row.label).width;
    ctx.font = font(46);
    const valueW = ctx.measureText(row.value).width;
    const plateW = Math.min(maxPlateW, Math.max(labelW, valueW) + 76);
    paraPath(ctx, 36 + iconBox + 12, y, plateW, rowH, SKEW * 0.9);
    ctx.fillStyle = "rgba(11,39,64,0.94)";
    ctx.fill();
    const tx = 36 + iconBox + 12 + 36 + SKEW * 0.45;
    ctx.fillStyle = theme.light;
    fitText(ctx, row.label, 23, plateW - 70);
    ctx.fillText(row.label, tx, y + 34);
    ctx.fillStyle = "#ffffff";
    fitText(ctx, row.value, 46, plateW - 70);
    ctx.fillText(row.value, tx, y + 80);
  });

  // ---- money plates (bottom-right) -------------------------------------------
  if (data.totalWonText) {
    const labelText = "TOTAL MONEY WON";
    const bigY = footerY - 30 - bigH;
    const labelY = bigY - labelH - 10;

    const moneyPx = fitText(ctx, data.totalWonText, 96, W * 0.55 - 110);
    const moneyW = ctx.measureText(data.totalWonText).width;
    const bigW = moneyW + 110;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    paraPath(ctx, rightEdge - bigW, bigY, bigW, bigH, SKEW);
    ctx.fillStyle = NAVY_DEEP;
    ctx.fill();
    ctx.restore();
    // accent underline inside the big plate
    paraPath(ctx, rightEdge - bigW + 18, bigY + bigH - 16, bigW - 46, 8, 2);
    ctx.fillStyle = theme.base;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = font(moneyPx);
    ctx.fillText(data.totalWonText, rightEdge - bigW + 55 + SKEW / 2, bigY + bigH / 2 + moneyPx * 0.37);

    ctx.font = font(28);
    const lw = ctx.measureText(labelText).width;
    const labelPlateW = lw + 76;
    paraPath(ctx, rightEdge - labelPlateW, labelY, labelPlateW, labelH, SKEW);
    ctx.fillStyle = theme.base;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(labelText, rightEdge - labelPlateW + 38 + SKEW / 2, labelY + labelH / 2 + 10);
  }
}

export function buildCaption(data: ShareCardData): string {
  if (data.kind === "raceday") {
    return `It's race day at the ${data.eventName}! ${data.distanceLabel} — let's go. 🏁 @peerracing #peerracing`;
  }
  const bits: string[] = [`Finished the ${data.eventName} ${data.distanceLabel}!`];
  if (data.timeText) bits.push(data.timeText);
  if (data.overallText) bits.push(data.overallText.toLowerCase());
  if (data.division && data.divisionPlaceText) {
    bits.push(`${data.divisionPlaceText.toLowerCase()} in ${data.division}`);
  }
  if (data.totalWonText) bits.push(`won ${data.totalWonText} 💰`);
  return `${bits.join(" · ")} @peerracing #peerracing`;
}

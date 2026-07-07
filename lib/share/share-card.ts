"use client";

/**
 * Racer share graphics — rendered entirely in the browser on a <canvas>.
 *
 * Two card kinds:
 *  - "raceday": posted at check-in — event, distance, IT'S RACE DAY!
 *  - "finish":  posted when results publish — division badge hero, time,
 *    places, incentive pools, money won.
 *
 * The racer's photo fills the frame (cover-cropped); without a photo we paint
 * a branded navy background with the PR logo. All copy sits on a bottom
 * gradient so it stays readable over any photo. Output sizes: 1080×1920
 * (9:16 story) and 1080×1350 (4:5 feed).
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
      femalePoolText: string | null; // "2ND FEMALE POOL"
      militaryPoolText: string | null; // "1ST MILITARY POOL"
      moneyLines: ShareMoneyLine[];
      totalWonText: string | null; // "$1,325.54"
      sponsorLogoUrl?: string | null;
    };

const NAVY = "#002F48";
const ORANGE = "#F26822";

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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Branded background when the racer skips the photo. */
function drawNoPhotoBackground(ctx: CanvasRenderingContext2D, w: number, h: number, logo: HTMLImageElement) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#04405f");
  g.addColorStop(0.55, NAVY);
  g.addColorStop(1, "#001c2c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Diagonal speed stripes
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.32);
  const stripes: Array<[number, number, string]> = [
    [-h, 90, "rgba(242,104,34,0.16)"],
    [-h + 150, 34, "rgba(242,104,34,0.30)"],
    [h * 0.22, 120, "rgba(255,255,255,0.05)"],
    [h * 0.4, 46, "rgba(242,104,34,0.22)"],
  ];
  for (const [y, sh, color] of stripes) {
    ctx.fillStyle = color;
    ctx.fillRect(-w * 1.5, y, w * 3, sh);
  }
  ctx.restore();

  // Big PR logo in the upper half
  const logoW = w * 0.62;
  const logoH = (logoW / logo.naturalWidth) * logo.naturalHeight;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 60;
  ctx.drawImage(logo, (w - logoW) / 2, h * 0.16, logoW, logoH);
  ctx.restore();
}

/** Chip with label text; returns chip width. */
function drawChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { bg: string; fg: string; px: number },
): number {
  ctx.font = font(opts.px);
  const padX = opts.px * 0.7;
  const wText = ctx.measureText(text).width;
  const w = wText + padX * 2;
  const h = opts.px * 1.9;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = opts.bg;
  ctx.fill();
  ctx.fillStyle = opts.fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + opts.px * 0.06);
  return w;
}

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

  const logo = await loadImage("/PR_primarylogo.svg");
  const badgeImg =
    data.kind === "finish" && data.division && BADGE_SRC[data.division]
      ? await loadImage(BADGE_SRC[data.division])
      : null;
  const sponsorImg = data.sponsorLogoUrl ? await loadImage(data.sponsorLogoUrl).catch(() => null) : null;

  // ---- background -------------------------------------------------------
  if (photo) {
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, W, H);
    drawCover(ctx, photo as HTMLImageElement, W, H);
  } else {
    drawNoPhotoBackground(ctx, W, H, logo);
  }

  // ---- bottom gradient panel -------------------------------------------
  const panelH = data.kind === "finish" ? Math.round(H * 0.4) : Math.round(H * 0.3);
  const gradTop = H - panelH - 140;
  const grad = ctx.createLinearGradient(0, gradTop, 0, H - panelH + 80);
  grad.addColorStop(0, "rgba(0,28,44,0)");
  grad.addColorStop(1, "rgba(0,28,44,0.94)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, gradTop, W, H - panelH + 80 - gradTop);
  ctx.fillStyle = "rgba(0,28,44,0.94)";
  ctx.fillRect(0, H - panelH + 79, W, panelH - 79 + 1);

  const M = 56; // side margin
  ctx.textBaseline = "alphabetic";

  // ---- footer bar (both kinds) ------------------------------------------
  const footerH = 108;
  const footerY = H - footerH;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, footerY, W, footerH);
  // PR logo left
  const fLogoH = 56;
  const fLogoW = (fLogoH / logo.naturalHeight) * logo.naturalWidth;
  ctx.drawImage(logo, M, footerY + (footerH - fLogoH) / 2, fLogoW, fLogoH);
  // Sponsor right
  if (sponsorImg) {
    const label = "PR RESULTS POWERED BY";
    ctx.font = font(20);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const sLogoH = 58;
    const sLogoW = Math.min(240, (sLogoH / sponsorImg.naturalHeight) * sponsorImg.naturalWidth);
    const sLogoHFit = (sLogoW / sponsorImg.naturalWidth) * sponsorImg.naturalHeight;
    const labelW = ctx.measureText(label).width;
    const sX = W - M - sLogoW;
    ctx.fillText(label, W - M - labelW, footerY + footerH / 2 - 18);
    ctx.drawImage(sponsorImg, sX, footerY + footerH / 2 - 8, sLogoW, sLogoHFit > 58 ? 58 : sLogoHFit);
  } else {
    ctx.font = font(24);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const t = "PEERRACING.COM";
    ctx.fillText(t, W - M - ctx.measureText(t).width, footerY + footerH / 2 + 9);
  }

  // ---- content ------------------------------------------------------------
  if (data.kind === "raceday") {
    let y = H - footerH - 48;
    // Distance
    ctx.fillStyle = "#ffffff";
    fitText(ctx, data.distanceLabel.toUpperCase(), 54, W - M * 2);
    ctx.fillText(data.distanceLabel.toUpperCase(), M, y);
    y -= 78;
    // Event name
    ctx.fillStyle = ORANGE;
    fitText(ctx, data.eventName.toUpperCase(), 66, W - M * 2);
    ctx.fillText(data.eventName.toUpperCase(), M, y);
    y -= 96;
    // Headline
    ctx.fillStyle = "#ffffff";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 24;
    fitText(ctx, "IT'S RACE DAY!", 108, W - M * 2);
    ctx.fillText("IT'S RACE DAY!", M, y);
    ctx.restore();
    if (data.runnerName) {
      ctx.font = font(34);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(data.runnerName.toUpperCase(), M, H - footerH - 190 - 96 - 60);
    }
    return;
  }

  // ---- finish card ----------------------------------------------------------
  const badgeSize = 300;
  const badgeX = W - M - badgeSize + 24;
  const badgeY = H - panelH - badgeSize / 2 - 30;
  // Badge hero (floats over the gradient edge, right side)
  if (badgeImg) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 44;
    ctx.shadowOffsetY = 12;
    const bh = (badgeSize / badgeImg.naturalWidth) * badgeImg.naturalHeight;
    ctx.drawImage(badgeImg, badgeX, badgeY, badgeSize, bh);
    ctx.restore();
  }

  let y = H - panelH + 60;
  const textMaxW = badgeImg ? W - M * 2 - badgeSize + 10 : W - M * 2;

  // Event · distance kicker
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  const kicker = `${data.eventName} · ${data.distanceLabel}`.toUpperCase();
  fitText(ctx, kicker, 30, textMaxW);
  ctx.fillText(kicker, M, y);
  y += 24;

  // "FINISHED!" or runner name
  ctx.fillStyle = "#ffffff";
  const headline = (data.runnerName ? data.runnerName : "FINISHED!").toUpperCase();
  y += 56;
  fitText(ctx, headline, 56, textMaxW);
  ctx.fillText(headline, M, y);

  // Time — the hero number
  if (data.timeText) {
    y += 118;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffffff";
    fitText(ctx, data.timeText, 128, textMaxW);
    ctx.fillText(data.timeText, M, y);
    ctx.restore();
  }

  // Division line (orange, right under the time)
  if (data.division) {
    y += 62;
    ctx.fillStyle = ORANGE;
    const divLine = data.divisionPlaceText
      ? `${data.divisionPlaceText} — ${data.division.toUpperCase()} DIVISION`
      : `${data.division.toUpperCase()} DIVISION`;
    fitText(ctx, divLine, 46, textMaxW);
    ctx.fillText(divLine, M, y);
  }

  // Money hero
  if (data.totalWonText) {
    y += 108;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = ORANGE;
    const wonLine = `WON ${data.totalWonText}`;
    fitText(ctx, wonLine, 96, W - M * 2);
    ctx.fillText(wonLine, M, y);
    ctx.restore();
  }

  // Stat chips (wrap across lines)
  const chips: Array<{ text: string; bg: string; fg: string }> = [];
  if (data.overallText) chips.push({ text: data.overallText, bg: "rgba(255,255,255,0.14)", fg: "#ffffff" });
  for (const m of data.moneyLines) {
    chips.push({
      text: m.amountText ? `${m.label} · ${m.amountText}` : m.label,
      bg: "rgba(255,255,255,0.14)",
      fg: "#ffffff",
    });
  }
  if (data.femalePoolText) chips.push({ text: data.femalePoolText, bg: "rgba(214,51,108,0.85)", fg: "#ffffff" });
  if (data.militaryPoolText) chips.push({ text: data.militaryPoolText, bg: "rgba(92,107,47,0.9)", fg: "#ffffff" });

  if (chips.length > 0) {
    let cx = M;
    let cy = y + 44;
    const chipPx = 26;
    const gap = 14;
    for (const chip of chips) {
      ctx.font = font(chipPx);
      const cw = ctx.measureText(chip.text).width + chipPx * 1.4;
      if (cx + cw > W - M) {
        cx = M;
        cy += chipPx * 1.9 + gap;
      }
      if (cy + chipPx * 1.9 > footerY - 10) break; // never collide with the footer
      cx += drawChip(ctx, chip.text, cx, cy, { bg: chip.bg, fg: chip.fg, px: chipPx }) + gap;
    }
    ctx.textBaseline = "alphabetic";
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

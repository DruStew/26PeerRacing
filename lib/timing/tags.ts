import * as jsAruco from "js-aruco2";

const { AR } = jsAruco;

/**
 * Timing tags: ArUco fiducial markers printed on bib stickers. The camera
 * reads these at distance/motion far more reliably than QR codes.
 *
 * ARUCO_MIP_36h12 trades capacity for robustness: 250 unique ids with a
 * minimum hamming distance of 12 — practically immune to misreads from
 * clutter or blur. Bindings are per event, so a 250-tag roll covers any
 * event with up to 250 entrants; larger dictionaries can be added later
 * via timing_tags.tag_family without touching this plumbing.
 */

export const TAG_FAMILY = "ARUCO_MIP_36h12";
export const TAG_CAPACITY = 250;

let dictionary: jsAruco.AR.Dictionary | null = null;

function getDictionary(): jsAruco.AR.Dictionary {
  if (!dictionary) dictionary = new AR.Dictionary(TAG_FAMILY);
  return dictionary;
}

/** Raw marker SVG markup (square, includes white quiet zone). */
export function markerSvg(tagId: number): string {
  if (!Number.isInteger(tagId) || tagId < 0 || tagId >= TAG_CAPACITY) {
    throw new Error(`tag id out of range 0..${TAG_CAPACITY - 1}`);
  }
  return getDictionary().generateSVG(tagId);
}

/**
 * A complete print-ready sticker: marker + human-readable tag number +
 * placement instruction. Sized in inches via the svg width/height attrs
 * so print output is physically correct.
 */
export function stickerSvg(tagId: number, opts?: { widthIn?: number }): string {
  const widthIn = opts?.widthIn ?? 3.5;
  // Layout in abstract units: 100 wide; marker 84 with 8 margin; text below.
  const W = 100;
  const H = 118;
  const heightIn = (widthIn * H) / W;
  // Nest the marker svg inside the sticker (xmlns comes from the parent).
  const marker = markerSvg(tagId).replace(
    '<svg xmlns="http://www.w3.org/2000/svg"',
    '<svg x="8" y="8" width="84" height="84"',
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthIn}in" height="${heightIn.toFixed(3)}in" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`,
    marker,
    `<text x="50" y="101" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="bold" fill="black">PR TIMING TAG ${String(tagId).padStart(3, "0")}</text>`,
    `<text x="50" y="110" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="5.4" fill="black">Stick flat on the FRONT of the bib. Do not fold or cover.</text>`,
    `</svg>`,
  ].join("");
}

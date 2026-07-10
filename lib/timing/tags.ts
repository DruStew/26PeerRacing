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

/**
 * Max bit-errors accepted when decoding. Codes in this family are ≥12 bits
 * apart, so ≤5 errors still decodes unambiguously. The library default
 * (tau of 12) is far too loose — logos/text in the scene can ghost-match
 * with ~10 bit errors.
 */
export const TAG_MAX_HAMMING = 5;

let dictionary: jsAruco.AR.Dictionary | null = null;

function getDictionary(): jsAruco.AR.Dictionary {
  if (!dictionary) dictionary = new AR.Dictionary(TAG_FAMILY);
  return dictionary;
}

/**
 * Raw marker SVG markup (square, includes the quiet zone). Print-ready
 * branded stickers live in ./tag-sticker (server-only — pulls in fonts).
 */
export function markerSvg(tagId: number): string {
  if (!Number.isInteger(tagId) || tagId < 0 || tagId >= TAG_CAPACITY) {
    throw new Error(`tag id out of range 0..${TAG_CAPACITY - 1}`);
  }
  return getDictionary().generateSVG(tagId);
}

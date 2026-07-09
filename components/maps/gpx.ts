/** GPX parsing + line simplification for the course editor (client-side only). */

/** Parse GPX XML into [lng, lat] coords (track points, falling back to route points). */
export function parseGpx(xml: string): [number, number][] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return [];
  let pts = Array.from(doc.querySelectorAll("trkpt"));
  if (pts.length === 0) pts = Array.from(doc.querySelectorAll("rtept"));
  const coords: [number, number][] = [];
  for (const p of pts) {
    const lat = Number(p.getAttribute("lat"));
    const lon = Number(p.getAttribute("lon"));
    if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
  }
  return coords;
}

/** Douglas-Peucker simplification (planar approximation is fine at course scale). */
export function simplifyLine(coords: [number, number][], tolerance: number): [number, number][] {
  if (coords.length <= 2) return coords;
  const sqTol = tolerance * tolerance;

  const sqSegDist = (p: [number, number], a: [number, number], b: [number, number]) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };

  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(coords[i], coords[first], coords[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return coords.filter((_, i) => keep[i] === 1);
}

/** Simplify adaptively until the point count is editor-friendly. */
export function simplifyForEditor(coords: [number, number][]): [number, number][] {
  const MAX_POINTS = 1200;
  if (coords.length <= MAX_POINTS) return coords;
  let tolerance = 0.00001; // ≈1 m
  let out = coords;
  for (let i = 0; i < 12 && out.length > MAX_POINTS; i++) {
    out = simplifyLine(coords, tolerance);
    tolerance *= 2;
  }
  return out;
}

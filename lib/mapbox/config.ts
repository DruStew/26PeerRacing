/** Shared Mapbox configuration + geometry helpers (no Mapbox import; safe anywhere). */

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export function hasMapbox(): boolean {
  return MAPBOX_TOKEN.length > 0;
}

/** Default map style — Mapbox Outdoors suits race courses (terrain, paths, parks). */
export const MAP_STYLE = "mapbox://styles/mapbox/outdoors-v12";

/** Peer Racing brand colors used for course line + pin. */
export const COURSE_LINE_COLOR = "#E87722";
export const VENUE_PIN_COLOR = "#1E3A5F";

export type LngLat = { lng: number; lat: number };

/** A GeoJSON LineString feature collection, the shape we store in distances.course_geojson. */
export type CourseGeoJSON = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: Record<string, unknown>;
  }>;
};

const EARTH_RADIUS_M = 6371008.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance between two [lng, lat] points in meters. */
function segmentMeters(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(a[0]) === toRad(b[0]) ? 0 : toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length in meters of every LineString in a course GeoJSON. */
export function courseLengthMeters(geojson: CourseGeoJSON | null | undefined): number {
  if (!geojson?.features?.length) return 0;
  let total = 0;
  for (const f of geojson.features) {
    const coords = f.geometry?.coordinates ?? [];
    for (let i = 1; i < coords.length; i++) {
      total += segmentMeters(coords[i - 1], coords[i]);
    }
  }
  return total;
}

export function metersToMiles(m: number): number {
  return m / 1609.344;
}

export function metersToKm(m: number): number {
  return m / 1000;
}

/** Bounding box [west, south, east, north] of a course, for fitBounds. */
export function courseBounds(
  geojson: CourseGeoJSON | null | undefined,
): [number, number, number, number] | null {
  if (!geojson?.features?.length) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const f of geojson.features) {
    for (const [lng, lat] of f.geometry?.coordinates ?? []) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  if (!Number.isFinite(west)) return null;
  return [west, south, east, north];
}

/**
 * Universal "open in maps" deep link. Uses the geo: pattern via Google Maps URL,
 * which Apple Maps / Google Maps / default nav apps all resolve.
 */
export function directionsUrl(args: {
  lat: number;
  lng: number;
  label?: string | null;
}): string {
  const q = `${args.lat},${args.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

/** Static venue map link (drops a pin without forcing directions). */
export function venueMapUrl(args: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${args.lat},${args.lng}`;
}

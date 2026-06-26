import { MAPBOX_TOKEN } from "@/lib/mapbox/config";

export type VenueSearchResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export type VenueSearchBias = {
  /** Existing pin or map center for proximity bias. */
  proximity?: { lng: number; lat: number };
  /** Event city/state — appended to the query and used for proximity when no pin exists. */
  city?: string | null;
  state?: string | null;
};

/** Approximate US state centers for proximity bias (lng, lat). */
const US_STATE_CENTER: Record<string, [number, number]> = {
  AL: [-86.9023, 32.8067],
  AK: [-152.4044, 61.3707],
  AZ: [-111.4312, 33.7298],
  AR: [-92.3731, 34.9697],
  CA: [-119.6816, 36.1162],
  CO: [-105.3111, 39.0598],
  CT: [-72.7554, 41.5978],
  DE: [-75.5071, 39.3185],
  FL: [-81.5158, 27.7663],
  GA: [-83.6431, 33.0406],
  HI: [-157.4983, 21.0943],
  ID: [-114.4788, 44.2405],
  IL: [-89.3985, 40.3495],
  IN: [-86.2816, 39.8494],
  IA: [-93.2105, 42.0115],
  KS: [-98.4842, 38.5266],
  KY: [-84.6701, 37.6681],
  LA: [-91.8749, 31.1695],
  ME: [-69.3819, 44.6939],
  MD: [-76.8021, 39.0639],
  MA: [-71.5376, 42.2302],
  MI: [-84.5467, 43.3266],
  MN: [-94.6859, 46.7296],
  MS: [-89.6678, 32.7416],
  MO: [-92.1893, 38.4561],
  MT: [-110.4544, 46.9219],
  NE: [-98.2681, 41.1254],
  NV: [-117.0554, 38.3135],
  NH: [-71.5653, 43.4525],
  NJ: [-74.521, 40.2989],
  NM: [-106.2485, 34.8405],
  NY: [-74.9481, 42.1657],
  NC: [-79.0193, 35.6301],
  ND: [-99.784, 47.5289],
  OH: [-82.7649, 40.3888],
  OK: [-97.5164, 35.4676],
  OR: [-122.0709, 44.572],
  PA: [-77.1945, 40.5908],
  RI: [-71.5118, 41.6809],
  SC: [-80.945, 33.8569],
  SD: [-99.9018, 44.2998],
  TN: [-86.6923, 35.7478],
  TX: [-99.9018, 31.0545],
  UT: [-111.8926, 40.15],
  VT: [-72.7107, 44.0459],
  VA: [-78.1694, 37.7693],
  WA: [-121.4905, 47.4009],
  WV: [-80.9696, 38.4912],
  WI: [-89.6165, 44.2685],
  WY: [-107.3025, 42.7559],
  DC: [-77.0369, 38.9072],
};

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function stateCode(state?: string | null): string | null {
  if (!state?.trim()) return null;
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_NAME_TO_CODE[s.toLowerCase()] ?? null;
}

function buildSearchQuery(query: string, bias?: VenueSearchBias): string {
  const q = query.trim();
  if (!bias?.city && !bias?.state) return q;

  const parts = [bias.city, bias.state].filter(Boolean).join(", ");
  if (!parts) return q;

  const lower = q.toLowerCase();
  const statePart = bias.state?.trim().toLowerCase() ?? "";
  const cityPart = bias.city?.trim().toLowerCase() ?? "";
  if (
    (statePart && lower.includes(statePart)) ||
    (cityPart && lower.includes(cityPart))
  ) {
    return q;
  }

  return `${q}, ${parts}`;
}

function proximityFromBias(bias?: VenueSearchBias): string | null {
  if (bias?.proximity) {
    return `${bias.proximity.lng},${bias.proximity.lat}`;
  }
  const code = stateCode(bias?.state);
  if (code && US_STATE_CENTER[code]) {
    const [lng, lat] = US_STATE_CENTER[code];
    return `${lng},${lat}`;
  }
  return null;
}

type SearchBoxFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    coordinates?: { latitude: number; longitude: number };
  };
};

/**
 * Forward search for race venues — parks, landmarks, addresses, and places.
 * Uses Mapbox Search Box API (Geocoding v6 omits POI data like state parks).
 */
export async function searchVenuePlaces(
  query: string,
  bias?: VenueSearchBias,
): Promise<VenueSearchResult[]> {
  if (!MAPBOX_TOKEN) return [];

  const searchQ = buildSearchQuery(query, bias);
  const params = new URLSearchParams({
    q: searchQ,
    limit: "8",
    language: "en",
    country: "US",
    access_token: MAPBOX_TOKEN,
  });

  const proximity = proximityFromBias(bias);
  if (proximity) params.set("proximity", proximity);

  const url = `https://api.mapbox.com/search/searchbox/v1/forward?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mapbox search failed (${res.status})`);
  }

  const json = (await res.json()) as { features?: SearchBoxFeature[] };
  return (json.features ?? [])
    .map((f) => {
      const p = f.properties ?? {};
      const geom = f.geometry?.coordinates;
      const lat = p.coordinates?.latitude ?? geom?.[1];
      const lng = p.coordinates?.longitude ?? geom?.[0];
      if (lat == null || lng == null) return null;

      const name = p.name?.trim() ?? "";
      const address =
        p.full_address?.trim() ||
        [name, p.place_formatted?.trim()].filter(Boolean).join(", ") ||
        p.place_formatted?.trim() ||
        "";

      return { name, address, lat, lng };
    })
    .filter(Boolean) as VenueSearchResult[];
}

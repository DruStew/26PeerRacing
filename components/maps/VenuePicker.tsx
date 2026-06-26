"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { MAP_STYLE, MAPBOX_TOKEN, VENUE_PIN_COLOR } from "@/lib/mapbox/config";

type Venue = {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

type GeoResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60";
const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]";
const inputClass =
  "w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

export function VenuePicker({
  eventId,
  initial,
}: {
  eventId: string;
  initial: Venue;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  const [venue, setVenue] = useState<Venue>(initial);
  const [query, setQuery] = useState(initial.address || initial.name || "");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeMarker = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: VENUE_PIN_COLOR, draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      markerRef.current.on("dragend", () => {
        const ll = markerRef.current!.getLngLat();
        setVenue((v) => ({ ...v, lat: ll.lat, lng: ll.lng }));
      });
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const hasPin = initial.lat != null && initial.lng != null;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: hasPin ? [initial.lng!, initial.lat!] : [-98.5795, 39.8283],
      zoom: hasPin ? 13 : 3,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (hasPin) placeMarker(initial.lng!, initial.lat!);
    });

    // Click to drop / move the pin.
    map.on("click", (e) => {
      placeMarker(e.lngLat.lng, e.lngLat.lat);
      setVenue((v) => ({ ...v, lat: e.lngLat.lat, lng: e.lngLat.lng }));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [initial.lat, initial.lng, placeMarker]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || !MAPBOX_TOKEN) return;
    setSearching(true);
    setError(null);
    try {
      const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(
        q,
      )}&limit=5&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(url);
      const json = (await res.json()) as {
        features?: Array<{
          properties?: {
            name?: string;
            full_address?: string;
            place_formatted?: string;
            coordinates?: { latitude: number; longitude: number };
          };
        }>;
      };
      const mapped: GeoResult[] = (json.features ?? [])
        .map((f) => {
          const p = f.properties ?? {};
          const c = p.coordinates;
          if (!c) return null;
          return {
            name: p.name ?? "",
            address: p.full_address ?? p.place_formatted ?? "",
            lat: c.latitude,
            lng: c.longitude,
          };
        })
        .filter(Boolean) as GeoResult[];
      setResults(mapped);
      if (mapped.length === 0) setError("No matches found. Try a more specific address.");
    } catch {
      setError("Search failed. Check your Mapbox token.");
    } finally {
      setSearching(false);
    }
  }, [query]);

  function selectResult(r: GeoResult) {
    setVenue({ name: r.name, address: r.address, lat: r.lat, lng: r.lng });
    setResults([]);
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [r.lng, r.lat], zoom: 14 });
      placeMarker(r.lng, r.lat);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/promoter/events/${eventId}/venue`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue_name: venue.name,
          venue_address: venue.address,
          venue_lat: venue.lat,
          venue_lng: venue.lng,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }
      setNotice("Venue location saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  if (!MAPBOX_TOKEN) {
    return (
      <p className="rounded-lg border border-dashed border-[#1E3A5F]/20 bg-[#fafbfc] px-4 py-3 text-sm text-[#1E3A5F]/60">
        Set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment to enable
        the venue map.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
          placeholder="Search address or place (e.g. Zilker Park, Austin TX)"
          className={inputClass}
        />
        <button type="button" onClick={() => void runSearch()} disabled={searching} className={btnGhost}>
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {results.length > 0 ? (
        <ul className="divide-y divide-[#1E3A5F]/10 overflow-hidden rounded-lg border border-[#1E3A5F]/15 bg-white">
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                onClick={() => selectResult(r)}
                className="flex w-full flex-col items-start px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#fafbfc]"
              >
                <span className="font-medium text-[#1E3A5F]">{r.name || r.address}</span>
                {r.address && r.address !== r.name ? (
                  <span className="text-[#1E3A5F]/60">{r.address}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div ref={containerRef} className="h-80 w-full overflow-hidden rounded-xl" />
      <p className="text-xs text-[#1E3A5F]/55">
        Search for the venue, then fine-tune by clicking the map or dragging the pin.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Venue name</label>
          <input
            value={venue.name}
            onChange={(e) => setVenue((v) => ({ ...v, name: e.target.value }))}
            placeholder="Start/finish area"
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Address</label>
          <input
            value={venue.address}
            onChange={(e) => setVenue((v) => ({ ...v, address: e.target.value }))}
            placeholder="Street, City, State"
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
      </div>

      <p className="text-xs text-[#1E3A5F]/55">
        {venue.lat != null && venue.lng != null
          ? `Pin: ${venue.lat.toFixed(5)}, ${venue.lng.toFixed(5)}`
          : "No pin set yet."}
      </p>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? "Saving…" : "Save venue location"}
        </button>
        {venue.lat != null && venue.lng != null ? (
          <button
            type="button"
            onClick={() => {
              setVenue((v) => ({ ...v, lat: null, lng: null }));
              markerRef.current?.remove();
              markerRef.current = null;
            }}
            className={btnGhost}
          >
            Clear pin
          </button>
        ) : null}
      </div>
    </div>
  );
}

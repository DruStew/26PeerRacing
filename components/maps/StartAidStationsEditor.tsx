"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { MAP_STYLE, MAPBOX_TOKEN, VENUE_PIN_COLOR } from "@/lib/mapbox/config";
import { searchVenuePlaces, type VenueSearchBias } from "@/lib/mapbox/venue-search";

const AID_PIN_COLOR = "#0d9488";

type AidStation = {
  key: string;
  name: string;
  mile_marker: string;
  lat: number | null;
  lng: number | null;
  drop_bags: boolean;
};

type StartLocation = {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

type PinMode = "start" | "aid";

const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60";
const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]";
const inputClass =
  "w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `aid-${Date.now()}-${keyCounter}`;
}

export function StartAidStationsEditor({
  eventId,
  distanceId,
  initialStart,
  initialStations,
  venue,
  searchBias,
}: {
  eventId: string;
  distanceId: string;
  initialStart: StartLocation;
  initialStations: Array<{
    name: string;
    mile_marker: string | null;
    lat: number | null;
    lng: number | null;
    drop_bags: boolean;
  }>;
  /** Event venue pin — map centers here and start defaults to it. */
  venue: { lat: number; lng: number } | null;
  searchBias?: VenueSearchBias;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const startMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const aidMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  const [start, setStart] = useState<StartLocation>(initialStart);
  const [stations, setStations] = useState<AidStation[]>(() =>
    initialStations.map((s) => ({
      key: nextKey(),
      name: s.name,
      mile_marker: s.mile_marker ?? "",
      lat: s.lat,
      lng: s.lng,
      drop_bags: s.drop_bags,
    })),
  );
  const [mode, setMode] = useState<PinMode>("start");
  const modeRef = useRef<PinMode>("start");
  modeRef.current = mode;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ name: string; address: string; lat: number; lng: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeStartMarker = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (!startMarkerRef.current) {
      startMarkerRef.current = new mapboxgl.Marker({ color: VENUE_PIN_COLOR, draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      startMarkerRef.current.on("dragend", () => {
        const ll = startMarkerRef.current!.getLngLat();
        setStart((s) => ({ ...s, lat: ll.lat, lng: ll.lng }));
      });
    } else {
      startMarkerRef.current.setLngLat([lng, lat]);
    }
  }, []);

  const addStationAt = useCallback((lng: number, lat: number) => {
    const key = nextKey();
    setStations((list) => [
      ...list,
      { key, name: `Aid ${list.length + 1}`, mile_marker: "", lat, lng, drop_bags: false },
    ]);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const center: [number, number] =
      initialStart.lng != null && initialStart.lat != null
        ? [initialStart.lng, initialStart.lat]
        : venue
          ? [venue.lng, venue.lat]
          : [-98.5795, 39.8283];
    const hasCenter = (initialStart.lng != null && initialStart.lat != null) || venue != null;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: hasCenter ? 12 : 3,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (initialStart.lat != null && initialStart.lng != null) {
        placeStartMarker(initialStart.lng, initialStart.lat);
      }
    });

    map.on("click", (e) => {
      if (modeRef.current === "start") {
        placeStartMarker(e.lngLat.lng, e.lngLat.lat);
        setStart((s) => ({ ...s, lat: e.lngLat.lat, lng: e.lngLat.lng }));
      } else {
        addStationAt(e.lngLat.lng, e.lngLat.lat);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      startMarkerRef.current = null;
      aidMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep aid-station markers in sync with state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = aidMarkersRef.current;

    for (const [key, marker] of markers) {
      if (!stations.some((s) => s.key === key)) {
        marker.remove();
        markers.delete(key);
      }
    }

    for (const s of stations) {
      if (s.lat == null || s.lng == null) continue;
      const existing = markers.get(s.key);
      if (existing) {
        existing.setLngLat([s.lng, s.lat]);
      } else {
        const marker = new mapboxgl.Marker({ color: AID_PIN_COLOR, draggable: true })
          .setLngLat([s.lng, s.lat])
          .addTo(map);
        marker.on("dragend", () => {
          const ll = marker.getLngLat();
          setStations((list) =>
            list.map((st) => (st.key === s.key ? { ...st, lat: ll.lat, lng: ll.lng } : st)),
          );
        });
        markers.set(s.key, marker);
      }
    }
  }, [stations]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || !MAPBOX_TOKEN) return;
    setSearching(true);
    setError(null);
    try {
      const bias: VenueSearchBias = {
        ...searchBias,
        proximity:
          start.lat != null && start.lng != null
            ? { lat: start.lat, lng: start.lng }
            : venue
              ? { lat: venue.lat, lng: venue.lng }
              : searchBias?.proximity,
      };
      const mapped = await searchVenuePlaces(q, bias);
      setResults(mapped);
      if (mapped.length === 0) setError("No matches — click the map to drop a pin instead.");
    } catch {
      setError("Search failed. Check your Mapbox token.");
    } finally {
      setSearching(false);
    }
  }, [query, searchBias, start.lat, start.lng, venue]);

  function selectResult(r: { name: string; address: string; lat: number; lng: number }) {
    setResults([]);
    const map = mapRef.current;
    if (map) map.flyTo({ center: [r.lng, r.lat], zoom: 14 });
    if (modeRef.current === "start") {
      setStart({ name: r.name, address: r.address, lat: r.lat, lng: r.lng });
      placeStartMarker(r.lng, r.lat);
    } else {
      addStationAt(r.lng, r.lat);
    }
  }

  function updateStation(key: string, patch: Partial<AidStation>) {
    setStations((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function removeStation(key: string) {
    setStations((list) => list.filter((s) => s.key !== key));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/promoter/events/${eventId}/distances/${distanceId}/logistics`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_location_name: start.name,
            start_location_address: start.address,
            start_lat: start.lat,
            start_lng: start.lng,
            aid_stations: stations.map((s) => ({
              name: s.name,
              mile_marker: s.mile_marker || null,
              lat: s.lat,
              lng: s.lng,
              drop_bags: s.drop_bags,
            })),
          }),
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }
      setNotice("Start line & aid stations saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  if (!MAPBOX_TOKEN) {
    return (
      <p className="rounded-lg border border-dashed border-[#1E3A5F]/20 bg-[#fafbfc] px-4 py-3 text-sm text-[#1E3A5F]/60">
        Set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable the start line and
        aid station map.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-[#1E3A5F]">Map click adds:</span>
        <button
          type="button"
          onClick={() => setMode("start")}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
            mode === "start"
              ? "bg-[#1E3A5F] text-white"
              : "border border-[#1E3A5F]/20 text-[#1E3A5F] hover:border-[#E87722]"
          }`}
        >
          Start line pin
        </button>
        <button
          type="button"
          onClick={() => setMode("aid")}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
            mode === "aid"
              ? "bg-teal-600 text-white"
              : "border border-[#1E3A5F]/20 text-[#1E3A5F] hover:border-[#E87722]"
          }`}
        >
          Aid station pin
        </button>
      </div>

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
          placeholder="Search a place (e.g. Dalton Lake Trailhead, SD)"
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
        Navy pin = start line (drag to fine-tune). Teal pins = aid stations. Leave the start pin
        empty if this race starts at the event venue.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Start location name</label>
          <input
            value={start.name}
            onChange={(e) => setStart((s) => ({ ...s, name: e.target.value }))}
            placeholder="Same as event venue if blank"
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Start address / directions</label>
          <input
            value={start.address}
            onChange={(e) => setStart((s) => ({ ...s, address: e.target.value }))}
            placeholder="Half mile before trailhead on Runkle Rd."
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
      </div>

      <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-[#1E3A5F]">
            Aid stations ({stations.length})
          </h3>
          <button
            type="button"
            onClick={() =>
              setStations((list) => [
                ...list,
                { key: nextKey(), name: `Aid ${list.length + 1}`, mile_marker: "", lat: null, lng: null, drop_bags: false },
              ])
            }
            className="text-sm font-semibold text-[#E87722] transition-colors hover:text-[#E87722]/80"
          >
            Add without pin
          </button>
        </div>
        <p className="mt-1 text-xs text-[#1E3A5F]/60">
          Switch the toggle above to “Aid station pin” and click the map, or add one here without a
          location. Mile marker is free text — “19/87” works for out-and-back courses.
        </p>

        {stations.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {stations.map((s, i) => (
              <li
                key={s.key}
                className="grid gap-2 rounded-lg border border-[#1E3A5F]/10 bg-white p-3 sm:grid-cols-[1.4fr_0.8fr_auto_auto] sm:items-center"
              >
                <div>
                  <label className="text-xs font-medium text-[#1E3A5F]/70">Name</label>
                  <input
                    value={s.name}
                    onChange={(e) => updateStation(s.key, { name: e.target.value })}
                    placeholder={`Aid ${i + 1}`}
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1E3A5F]/70">Mile</label>
                  <input
                    value={s.mile_marker}
                    onChange={(e) => updateStation(s.key, { mile_marker: e.target.value })}
                    placeholder="19/87"
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1E3A5F] sm:mt-5">
                  <input
                    type="checkbox"
                    checked={s.drop_bags}
                    onChange={(e) => updateStation(s.key, { drop_bags: e.target.checked })}
                    className="h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
                  />
                  Drop bags
                </label>
                <div className="flex items-center gap-3 sm:mt-5">
                  <span className="text-xs text-[#1E3A5F]/50">
                    {s.lat != null && s.lng != null ? "📍 pinned" : "no pin"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeStation(s.key)}
                    className="text-xs font-semibold text-[#1E3A5F]/70 transition-colors hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[#1E3A5F]/55">
            No aid stations yet — fine for short races like a 5K.
          </p>
        )}
      </div>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? "Saving…" : "Save start line & aid stations"}
        </button>
        {start.lat != null && start.lng != null ? (
          <button
            type="button"
            onClick={() => {
              setStart((s) => ({ ...s, lat: null, lng: null }));
              startMarkerRef.current?.remove();
              startMarkerRef.current = null;
            }}
            className={btnGhost}
          >
            Clear start pin
          </button>
        ) : null}
      </div>
    </div>
  );
}

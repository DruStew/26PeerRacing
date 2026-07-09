"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

import {
  COURSE_LINE_COLOR,
  MAP_STYLE,
  MAPBOX_TOKEN,
  VENUE_PIN_COLOR,
  courseBounds,
  courseLengthMeters,
  metersToKm,
  metersToMiles,
  type CourseGeoJSON,
} from "@/lib/mapbox/config";
import { searchVenuePlaces, type VenueSearchBias } from "@/lib/mapbox/venue-search";
import { parseGpx, simplifyForEditor } from "./gpx";
import { PIN_COLORS, PIN_LABELS, type RaceMapPinKind } from "./race-map-pins";

/**
 * The one race map: course line (draw or GPX import), start/finish pins,
 * aid stations, and QR checkpoint pins — each with an optional note to
 * runners. One save button writes course + logistics + checkpoints.
 */

type StartState = { name: string; address: string; note: string; lat: number | null; lng: number | null };
type FinishState = { name: string; note: string; lat: number | null; lng: number | null };

type AidStation = {
  key: string;
  name: string;
  mile_marker: string;
  lat: number | null;
  lng: number | null;
  drop_bags: boolean;
  note: string;
};

type Checkpoint = {
  key: string;
  id: string | null;
  name: string;
  mile_marker: string;
  lat: number | null;
  lng: number | null;
  note: string;
  audio_url: string | null;
  scan_url: string | null;
};

type PinMode = RaceMapPinKind;

const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60";
const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]";
const inputClass =
  "w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-${Date.now()}-${keyCounter}`;
}

export function RaceMapEditor({
  eventId,
  distanceId,
  initialCourse,
  initialStart,
  initialFinish,
  initialStations,
  initialCheckpoints,
  venue,
  searchBias,
}: {
  eventId: string;
  distanceId: string;
  initialCourse: CourseGeoJSON | null;
  initialStart: { name: string; address: string; note: string; lat: number | null; lng: number | null };
  initialFinish: { name: string; note: string; lat: number | null; lng: number | null };
  initialStations: Array<{
    name: string;
    mile_marker: string | null;
    lat: number | null;
    lng: number | null;
    drop_bags: boolean;
    note: string | null;
  }>;
  initialCheckpoints: Array<{
    id: string;
    name: string;
    mile_marker: string | null;
    lat: number | null;
    lng: number | null;
    note: string | null;
    audio_url: string | null;
    scan_url: string;
  }>;
  venue: { lat: number; lng: number } | null;
  searchBias?: VenueSearchBias;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const gpxInputRef = useRef<HTMLInputElement | null>(null);
  const startMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const finishMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const aidMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const cpMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const audioInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const [start, setStart] = useState<StartState>(initialStart);
  const [finish, setFinish] = useState<FinishState>(initialFinish);
  const [stations, setStations] = useState<AidStation[]>(() =>
    initialStations.map((s) => ({
      key: nextKey("aid"),
      name: s.name,
      mile_marker: s.mile_marker ?? "",
      lat: s.lat,
      lng: s.lng,
      drop_bags: s.drop_bags,
      note: s.note ?? "",
    })),
  );
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(() =>
    initialCheckpoints.map((c) => ({
      key: nextKey("cp"),
      id: c.id,
      name: c.name,
      mile_marker: c.mile_marker ?? "",
      lat: c.lat,
      lng: c.lng,
      note: c.note ?? "",
      audio_url: c.audio_url,
      scan_url: c.scan_url,
    })),
  );

  const [pinMode, setPinMode] = useState<PinMode | null>(null);
  const pinModeRef = useRef<PinMode | null>(null);
  pinModeRef.current = pinMode;

  // A specific aid station / checkpoint row "armed" to receive the next map
  // click as its pin (row-level Place pin / Move pin buttons).
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const armedKeyRef = useRef<string | null>(null);
  armedKeyRef.current = armedKey;

  function armRow(key: string) {
    setArmedKey((k) => (k === key ? null : key));
    setPinMode(null);
    drawRef.current?.changeMode("simple_select");
  }

  const [lengthMeters, setLengthMeters] = useState(() => courseLengthMeters(initialCourse));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ name: string; address: string; lat: number; lng: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audioBusy, setAudioBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkpointApiBase = `/api/promoter/events/${eventId}/distances/${distanceId}/checkpoints`;

  const recomputeLength = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    const fc = draw.getAll() as unknown as CourseGeoJSON;
    setLengthMeters(courseLengthMeters(fc));
  }, []);

  // ---- map init ------------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const bounds = courseBounds(initialCourse);
    const center: [number, number] = bounds
      ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
      : venue
        ? [venue.lng, venue.lat]
        : [-98.5795, 39.8283];

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: venue || bounds ? 13 : 3,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { line_string: true, trash: true },
      styles: [
        {
          id: "gl-draw-line",
          type: "line",
          filter: ["all", ["==", "$type", "LineString"]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": COURSE_LINE_COLOR, "line-width": 4 },
        },
        {
          id: "gl-draw-vertex",
          type: "circle",
          filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
          paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": COURSE_LINE_COLOR, "circle-stroke-width": 2 },
        },
        {
          id: "gl-draw-midpoint",
          type: "circle",
          filter: ["all", ["==", "meta", "midpoint"]],
          paint: { "circle-radius": 3, "circle-color": COURSE_LINE_COLOR },
        },
      ],
    });
    drawRef.current = draw;
    map.addControl(draw as unknown as mapboxgl.IControl, "top-left");

    map.on("load", () => {
      if (initialCourse?.features?.length) {
        draw.set(initialCourse as unknown as GeoJSON.FeatureCollection);
        const b = courseBounds(initialCourse);
        if (b) map.fitBounds(b as [number, number, number, number], { padding: 48, maxZoom: 15 });
      }
      if (venue) {
        new mapboxgl.Marker({ color: VENUE_PIN_COLOR, scale: 0.8 })
          .setLngLat([venue.lng, venue.lat])
          .setPopup(new mapboxgl.Popup({ offset: 24 }).setText("Event venue"))
          .addTo(map);
      }
    });

    map.on("draw.create", recomputeLength);
    map.on("draw.update", recomputeLength);
    map.on("draw.delete", recomputeLength);
    // Entering line-draw mode turns pin drops off so one click never does both.
    map.on("draw.modechange", (e: { mode: string }) => {
      if (e.mode === "draw_line_string") {
        setPinMode(null);
        setArmedKey(null);
      }
    });

    map.on("click", (e) => {
      const { lat, lng } = e.lngLat;

      // An armed row (Place pin / Move pin button) wins over the mode toggle.
      const armed = armedKeyRef.current;
      if (armed) {
        if (armed.startsWith("aid-")) {
          setStations((list) => list.map((s) => (s.key === armed ? { ...s, lat, lng } : s)));
        } else if (armed.startsWith("cp-")) {
          setCheckpoints((list) => list.map((c) => (c.key === armed ? { ...c, lat, lng } : c)));
        }
        setArmedKey(null);
        return;
      }

      const mode = pinModeRef.current;
      if (!mode) return;
      if (mode === "start") setStart((s) => ({ ...s, lat, lng }));
      else if (mode === "finish") setFinish((f) => ({ ...f, lat, lng }));
      else if (mode === "aid") {
        setStations((list) => [
          ...list,
          { key: nextKey("aid"), name: `Aid ${list.length + 1}`, mile_marker: "", lat, lng, drop_bags: false, note: "" },
        ]);
      } else if (mode === "checkpoint") {
        setCheckpoints((list) => {
          // First click fills an existing checkpoint that has no pin yet.
          const unpinned = list.findIndex((c) => c.lat == null || c.lng == null);
          if (unpinned >= 0) {
            return list.map((c, i) => (i === unpinned ? { ...c, lat, lng } : c));
          }
          return [
            ...list,
            {
              key: nextKey("cp"),
              id: null,
              name: `Checkpoint ${list.length + 1}`,
              mile_marker: "",
              lat,
              lng,
              note: "",
              audio_url: null,
              scan_url: null,
            },
          ];
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
      startMarkerRef.current = null;
      finishMarkerRef.current = null;
      aidMarkersRef.current.clear();
      cpMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- marker sync ----------------------------------------------------------

  const syncSingleMarker = useCallback(
    (
      ref: { current: mapboxgl.Marker | null },
      lat: number | null,
      lng: number | null,
      color: string,
      label: string,
      onDrag: (lat: number, lng: number) => void,
    ) => {
      const map = mapRef.current;
      if (!map) return;
      if (lat == null || lng == null) {
        ref.current?.remove();
        ref.current = null;
        return;
      }
      if (!ref.current) {
        const marker = new mapboxgl.Marker({ color, draggable: true })
          .setLngLat([lng, lat])
          .setPopup(new mapboxgl.Popup({ offset: 24 }).setText(label))
          .addTo(map);
        marker.on("dragend", () => {
          const ll = marker.getLngLat();
          onDrag(ll.lat, ll.lng);
        });
        ref.current = marker;
      } else {
        ref.current.setLngLat([lng, lat]);
        ref.current.getPopup()?.setText(label);
      }
    },
    [],
  );

  useEffect(() => {
    syncSingleMarker(startMarkerRef, start.lat, start.lng, PIN_COLORS.start, start.name || "Start line", (lat, lng) =>
      setStart((s) => ({ ...s, lat, lng })),
    );
  }, [start.lat, start.lng, start.name, syncSingleMarker]);

  useEffect(() => {
    syncSingleMarker(finishMarkerRef, finish.lat, finish.lng, PIN_COLORS.finish, finish.name || "Finish line", (lat, lng) =>
      setFinish((f) => ({ ...f, lat, lng })),
    );
  }, [finish.lat, finish.lng, finish.name, syncSingleMarker]);

  const syncListMarkers = useCallback(
    <T extends { key: string; name: string; lat: number | null; lng: number | null }>(
      items: T[],
      markers: Map<string, mapboxgl.Marker>,
      color: string,
      onDrag: (key: string, lat: number, lng: number) => void,
    ) => {
      const map = mapRef.current;
      if (!map) return;
      for (const [key, marker] of markers) {
        const item = items.find((i) => i.key === key);
        if (!item || item.lat == null || item.lng == null) {
          marker.remove();
          markers.delete(key);
        }
      }
      for (const item of items) {
        if (item.lat == null || item.lng == null) continue;
        const existing = markers.get(item.key);
        if (existing) {
          existing.setLngLat([item.lng, item.lat]);
          existing.getPopup()?.setText(item.name);
        } else {
          const marker = new mapboxgl.Marker({ color, draggable: true })
            .setLngLat([item.lng, item.lat])
            .setPopup(new mapboxgl.Popup({ offset: 24 }).setText(item.name))
            .addTo(map);
          marker.on("dragend", () => {
            const ll = marker.getLngLat();
            onDrag(item.key, ll.lat, ll.lng);
          });
          markers.set(item.key, marker);
        }
      }
    },
    [],
  );

  useEffect(() => {
    syncListMarkers(stations, aidMarkersRef.current, PIN_COLORS.aid, (key, lat, lng) =>
      setStations((list) => list.map((s) => (s.key === key ? { ...s, lat, lng } : s))),
    );
  }, [stations, syncListMarkers]);

  useEffect(() => {
    syncListMarkers(checkpoints, cpMarkersRef.current, PIN_COLORS.checkpoint, (key, lat, lng) =>
      setCheckpoints((list) => list.map((c) => (c.key === key ? { ...c, lat, lng } : c))),
    );
  }, [checkpoints, syncListMarkers]);

  // ---- course helpers -------------------------------------------------------

  function courseEndpoints(): { start: [number, number] | null; end: [number, number] | null } {
    const fc = drawRef.current?.getAll() as unknown as CourseGeoJSON | undefined;
    const coords = fc?.features?.[0]?.geometry?.coordinates ?? [];
    if (coords.length < 2) return { start: null, end: null };
    return { start: coords[0], end: coords[coords.length - 1] };
  }

  function snapStartToCourse() {
    const { start: c } = courseEndpoints();
    if (!c) {
      setError("Draw or import the course first, then snap the start pin to it.");
      return;
    }
    setError(null);
    setStart((s) => ({ ...s, lat: c[1], lng: c[0] }));
    mapRef.current?.flyTo({ center: c, zoom: 15 });
  }

  function snapFinishToCourse() {
    const { end: c } = courseEndpoints();
    if (!c) {
      setError("Draw or import the course first, then snap the finish pin to it.");
      return;
    }
    setError(null);
    setFinish((f) => ({ ...f, lat: c[1], lng: c[0] }));
    mapRef.current?.flyTo({ center: c, zoom: 15 });
  }

  async function importGpx(file: File) {
    setError(null);
    setNotice(null);
    try {
      const xml = await file.text();
      const raw = parseGpx(xml);
      if (raw.length < 2) {
        setError("No track found in that GPX file — export the activity as GPX and try again.");
        return;
      }
      const coords = simplifyForEditor(raw);
      const draw = drawRef.current;
      const map = mapRef.current;
      if (!draw || !map) return;
      draw.deleteAll();
      draw.add({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      } as GeoJSON.Feature);
      recomputeLength();
      const fc = draw.getAll() as unknown as CourseGeoJSON;
      const b = courseBounds(fc);
      if (b) map.fitBounds(b as [number, number, number, number], { padding: 48, maxZoom: 15 });
      setNotice(
        `GPX imported (${raw.length.toLocaleString()} points${
          coords.length < raw.length ? `, simplified to ${coords.length.toLocaleString()}` : ""
        }). Check the line, then Save race map.`,
      );
    } catch {
      setError("Could not read that file.");
    }
  }

  // ---- search ---------------------------------------------------------------

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
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 14 });
    const mode = pinModeRef.current;
    if (mode === "start") {
      setStart((s) => ({ ...s, name: s.name || r.name, address: s.address || r.address, lat: r.lat, lng: r.lng }));
    } else if (mode === "finish") {
      setFinish((f) => ({ ...f, name: f.name || r.name, lat: r.lat, lng: r.lng }));
    } else if (mode === "aid") {
      setStations((list) => [
        ...list,
        { key: nextKey("aid"), name: r.name || `Aid ${list.length + 1}`, mile_marker: "", lat: r.lat, lng: r.lng, drop_bags: false, note: "" },
      ]);
    }
  }

  // ---- list edits -----------------------------------------------------------

  function updateStation(key: string, patch: Partial<AidStation>) {
    setStations((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function updateCheckpoint(key: string, patch: Partial<Checkpoint>) {
    setCheckpoints((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  // ---- checkpoint audio -----------------------------------------------------

  async function uploadAudio(checkpointId: string, file: File) {
    setAudioBusy(checkpointId);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${checkpointApiBase}/${checkpointId}/audio`, { method: "POST", body: form });
      const json = (await res.json()) as { ok: boolean; error?: string; audio_url?: string };
      if (!json.ok) {
        setError(json.error ?? "Audio upload failed.");
        return;
      }
      setCheckpoints((prev) =>
        prev.map((c) => (c.id === checkpointId ? { ...c, audio_url: json.audio_url ?? null } : c)),
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setAudioBusy(null);
    }
  }

  async function removeAudio(checkpointId: string) {
    setAudioBusy(checkpointId);
    setError(null);
    try {
      const res = await fetch(`${checkpointApiBase}/${checkpointId}/audio`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Could not remove audio.");
        return;
      }
      setCheckpoints((prev) => prev.map((c) => (c.id === checkpointId ? { ...c, audio_url: null } : c)));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setAudioBusy(null);
    }
  }

  // ---- save everything ------------------------------------------------------

  async function save() {
    setError(null);
    setNotice(null);

    const missingAid = stations.findIndex((s) => !s.name.trim());
    if (missingAid >= 0) {
      setError(`Aid station ${missingAid + 1} needs a name before saving.`);
      return;
    }
    const missingCp = checkpoints.findIndex((c) => !c.name.trim());
    if (missingCp >= 0) {
      setError(`Checkpoint ${missingCp + 1} needs a name before saving.`);
      return;
    }

    setSaving(true);
    try {
      const fc = (drawRef.current?.getAll() ?? { type: "FeatureCollection", features: [] }) as unknown as CourseGeoJSON;

      const courseRes = await fetch(`/api/promoter/events/${eventId}/distances/${distanceId}/course`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_geojson: fc.features.length ? fc : null }),
      });
      const courseJson = (await courseRes.json()) as { ok: boolean; error?: string };
      if (!courseRes.ok || !courseJson.ok) {
        setError(courseJson.error ?? `Course save failed (${courseRes.status})`);
        return;
      }

      const logisticsRes = await fetch(`/api/promoter/events/${eventId}/distances/${distanceId}/logistics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_location_name: start.name,
          start_location_address: start.address,
          start_lat: start.lat,
          start_lng: start.lng,
          start_note: start.note,
          finish_location_name: finish.name,
          finish_lat: finish.lat,
          finish_lng: finish.lng,
          finish_note: finish.note,
          aid_stations: stations.map((s) => ({
            name: s.name,
            mile_marker: s.mile_marker || null,
            lat: s.lat,
            lng: s.lng,
            drop_bags: s.drop_bags,
            note: s.note || null,
          })),
        }),
      });
      const logisticsJson = (await logisticsRes.json()) as { ok: boolean; error?: string };
      if (!logisticsRes.ok || !logisticsJson.ok) {
        setError(logisticsJson.error ?? `Start/aid save failed (${logisticsRes.status})`);
        return;
      }

      const cpRes = await fetch(checkpointApiBase, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkpoints: checkpoints.map((c) => ({
            id: c.id,
            name: c.name,
            mile_marker: c.mile_marker,
            lat: c.lat,
            lng: c.lng,
            note: c.note || null,
          })),
        }),
      });
      const cpJson = (await cpRes.json()) as {
        ok: boolean;
        error?: string;
        checkpoints?: Array<{
          id: string;
          name: string;
          mile_marker: string | null;
          lat: number | null;
          lng: number | null;
          note: string | null;
          audio_url: string | null;
          scan_url: string;
        }>;
      };
      if (!cpRes.ok || !cpJson.ok || !cpJson.checkpoints) {
        setError(cpJson.error ?? `Checkpoint save failed (${cpRes.status})`);
        return;
      }
      setCheckpoints((prev) => {
        // Re-key from the server response, preserving marker keys where possible.
        return cpJson.checkpoints!.map((c, i) => ({
          key: prev[i]?.key ?? nextKey("cp"),
          id: c.id,
          name: c.name,
          mile_marker: c.mile_marker ?? "",
          lat: c.lat,
          lng: c.lng,
          note: c.note ?? "",
          audio_url: c.audio_url,
          scan_url: c.scan_url,
        }));
      });

      setNotice("Race map saved — course, start/finish, aid stations, and checkpoints.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  // ---- render ---------------------------------------------------------------

  if (!MAPBOX_TOKEN) {
    return (
      <p className="rounded-lg border border-dashed border-[#1E3A5F]/20 bg-[#fafbfc] px-4 py-3 text-sm text-[#1E3A5F]/60">
        Set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable the race map.
      </p>
    );
  }

  const modeButton = (mode: PinMode, activeClass: string) => (
    <button
      key={mode}
      type="button"
      onClick={() => {
        setPinMode((m) => (m === mode ? null : mode));
        setArmedKey(null);
        // Leaving draw mode ensures a click drops a pin instead of a vertex.
        drawRef.current?.changeMode("simple_select");
      }}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
        pinMode === mode ? activeClass : "border border-[#1E3A5F]/20 text-[#1E3A5F] hover:border-[#E87722]"
      }`}
    >
      {PIN_LABELS[mode]}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-[#1E3A5F]">Map click adds:</span>
        {modeButton("start", "bg-[#16a34a] text-white")}
        {modeButton("finish", "bg-[#dc2626] text-white")}
        {modeButton("aid", "bg-teal-600 text-white")}
        {modeButton("checkpoint", "bg-[#7c3aed] text-white")}
        {pinMode ? (
          <button
            type="button"
            onClick={() => setPinMode(null)}
            className="rounded-md border border-[#1E3A5F]/20 px-3 py-1.5 text-sm font-semibold text-[#1E3A5F]/70 hover:border-[#E87722]"
          >
            Done pinning
          </button>
        ) : (
          <span className="text-xs text-[#1E3A5F]/55">
            — or use the line tool (top-left of the map) to draw the course.
          </span>
        )}
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

      <div ref={containerRef} className="h-[28rem] w-full overflow-hidden rounded-xl" />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] px-4 py-3">
        <p className="text-sm text-[#1E3A5F]/80">
          Course length:{" "}
          <span className="font-semibold tabular-nums text-[#1E3A5F]">
            {metersToMiles(lengthMeters).toFixed(2)} mi
          </span>{" "}
          <span className="text-[#1E3A5F]/55">({metersToKm(lengthMeters).toFixed(2)} km)</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#1E3A5F]/70">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLORS.start }} /> Start
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLORS.finish }} /> Finish
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLORS.aid }} /> Aid
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLORS.checkpoint }} /> Checkpoint
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          ref={gpxInputRef}
          type="file"
          accept=".gpx,application/gpx+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importGpx(f);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => gpxInputRef.current?.click()} className={btnGhost}>
          Import GPX
        </button>
        <button
          type="button"
          onClick={() => {
            drawRef.current?.deleteAll();
            recomputeLength();
          }}
          className={btnGhost}
        >
          Clear course line
        </button>
        <button type="button" onClick={snapStartToCourse} className={btnGhost}>
          Snap start pin to course
        </button>
        <button type="button" onClick={snapFinishToCourse} className={btnGhost}>
          Snap finish pin to course
        </button>
      </div>

      {/* ---- start & finish ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-[#1E3A5F]">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLORS.start }} />
              Start line
            </h3>
            {start.lat != null && start.lng != null ? (
              <button
                type="button"
                onClick={() => setStart((s) => ({ ...s, lat: null, lng: null }))}
                className="text-xs font-semibold text-[#1E3A5F]/70 hover:text-red-600"
              >
                Clear pin
              </button>
            ) : (
              <span className="text-xs text-[#1E3A5F]/50">no pin — uses event venue</span>
            )}
          </div>
          <div className="mt-3 space-y-2.5">
            <input
              value={start.name}
              onChange={(e) => setStart((s) => ({ ...s, name: e.target.value }))}
              placeholder="Start location name (blank = event venue)"
              className={inputClass}
            />
            <input
              value={start.address}
              onChange={(e) => setStart((s) => ({ ...s, address: e.target.value }))}
              placeholder="Address / directions (Half mile before trailhead on Runkle Rd.)"
              className={inputClass}
            />
            <textarea
              value={start.note}
              onChange={(e) => setStart((s) => ({ ...s, note: e.target.value }))}
              placeholder="Note to runners (parking, arrival time, corrals…)"
              rows={2}
              className={inputClass}
            />
          </div>
        </div>

        <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-[#1E3A5F]">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLORS.finish }} />
              Finish line
            </h3>
            {finish.lat != null && finish.lng != null ? (
              <button
                type="button"
                onClick={() => setFinish((f) => ({ ...f, lat: null, lng: null }))}
                className="text-xs font-semibold text-[#1E3A5F]/70 hover:text-red-600"
              >
                Clear pin
              </button>
            ) : (
              <span className="text-xs text-[#1E3A5F]/50">no pin — loop courses can skip this</span>
            )}
          </div>
          <div className="mt-3 space-y-2.5">
            <input
              value={finish.name}
              onChange={(e) => setFinish((f) => ({ ...f, name: e.target.value }))}
              placeholder="Finish location name (blank = same as start)"
              className={inputClass}
            />
            <textarea
              value={finish.note}
              onChange={(e) => setFinish((f) => ({ ...f, note: e.target.value }))}
              placeholder="Note to runners (spectator access, shuttle back to start…)"
              rows={2}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* ---- aid stations ---- */}
      <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-[#1E3A5F]">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLORS.aid }} />
            Aid stations ({stations.length})
          </h3>
          <button
            type="button"
            onClick={() =>
              setStations((list) => [
                ...list,
                { key: nextKey("aid"), name: `Aid ${list.length + 1}`, mile_marker: "", lat: null, lng: null, drop_bags: false, note: "" },
              ])
            }
            className="text-sm font-semibold text-[#E87722] transition-colors hover:text-[#E87722]/80"
          >
            Add without pin
          </button>
        </div>
        <p className="mt-1 text-xs text-[#1E3A5F]/60">
          Turn on “Aid station” above and click the map, or add one here without a location. Mile
          marker is free text — “19/87” works for out-and-back courses.
        </p>

        {stations.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {stations.map((s, i) => (
              <li
                key={s.key}
                className={`space-y-2 rounded-lg border bg-white p-3 ${
                  armedKey === s.key
                    ? "border-teal-500 ring-2 ring-teal-500/30"
                    : "border-[#1E3A5F]/10"
                }`}
              >
                <div className="grid gap-2 sm:grid-cols-[1.4fr_0.6fr_auto] sm:items-end">
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
                  <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-[#1E3A5F]">
                    <input
                      type="checkbox"
                      checked={s.drop_bags}
                      onChange={(e) => updateStation(s.key, { drop_bags: e.target.checked })}
                      className="h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
                    />
                    Drop bags
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => armRow(s.key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      armedKey === s.key
                        ? "bg-teal-600 text-white"
                        : "border border-[#1E3A5F]/20 text-[#1E3A5F] hover:border-teal-600 hover:text-teal-700"
                    }`}
                  >
                    {armedKey === s.key
                      ? "Click the map…"
                      : s.lat != null && s.lng != null
                        ? "Move pin"
                        : "Place pin"}
                  </button>
                  {s.lat != null && s.lng != null ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          mapRef.current?.flyTo({ center: [s.lng as number, s.lat as number], zoom: 15 })
                        }
                        className="rounded-md border border-[#1E3A5F]/20 px-2.5 py-1 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
                      >
                        Show on map
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStation(s.key, { lat: null, lng: null })}
                        className="rounded-md border border-[#1E3A5F]/20 px-2.5 py-1 text-xs font-semibold text-[#1E3A5F]/70 hover:border-red-500 hover:text-red-600"
                      >
                        Clear pin
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-[#1E3A5F]/50">no pin yet</span>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setStations((list) => list.filter((x) => x.key !== s.key));
                      if (armedKey === s.key) setArmedKey(null);
                    }}
                    className="text-xs font-semibold text-[#1E3A5F]/70 transition-colors hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <input
                  value={s.note}
                  onChange={(e) => updateStation(s.key, { note: e.target.value })}
                  placeholder="Note to runners (water + tailwind only, crew access, cutoff…)"
                  className={inputClass}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[#1E3A5F]/55">No aid stations yet — fine for short races like a 5K.</p>
        )}
      </div>

      {/* ---- checkpoints ---- */}
      <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-[#1E3A5F]">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLORS.checkpoint }} />
            QR Trail Checkpoints ({checkpoints.length})
          </h3>
          <button
            type="button"
            onClick={() =>
              setCheckpoints((list) => [
                ...list,
                {
                  key: nextKey("cp"),
                  id: null,
                  name: `Checkpoint ${list.length + 1}`,
                  mile_marker: "",
                  lat: null,
                  lng: null,
                  note: "",
                  audio_url: null,
                  scan_url: null,
                },
              ])
            }
            className="text-sm font-semibold text-[#E87722] transition-colors hover:text-[#E87722]/80"
          >
            Add without pin
          </button>
        </div>
        <p className="mt-1 text-xs text-[#1E3A5F]/60">
          Scannable signs along the course — each scan pings the live board and can play an audio
          story. Turn on “Checkpoint” above and click the map to mark where each sign goes. Save to
          generate QR signs (SVG is true vector for your graphics person).
        </p>

        {checkpoints.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {checkpoints.map((cp) => (
              <li
                key={cp.key}
                className={`space-y-2 rounded-lg border bg-white p-3 ${
                  armedKey === cp.key
                    ? "border-[#7c3aed] ring-2 ring-[#7c3aed]/30"
                    : "border-[#1E3A5F]/10"
                }`}
              >
                <div className="grid gap-2 sm:grid-cols-[1.4fr_0.6fr] sm:items-end">
                  <div>
                    <label className="text-xs font-medium text-[#1E3A5F]/70">Name</label>
                    <input
                      value={cp.name}
                      onChange={(e) => updateCheckpoint(cp.key, { name: e.target.value })}
                      placeholder="Dalton Summit"
                      className={`mt-1 ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#1E3A5F]/70">Mile (optional)</label>
                    <input
                      value={cp.mile_marker}
                      onChange={(e) => updateCheckpoint(cp.key, { mile_marker: e.target.value })}
                      placeholder="42"
                      className={`mt-1 ${inputClass}`}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => armRow(cp.key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      armedKey === cp.key
                        ? "bg-[#7c3aed] text-white"
                        : "border border-[#1E3A5F]/20 text-[#1E3A5F] hover:border-[#7c3aed] hover:text-[#7c3aed]"
                    }`}
                  >
                    {armedKey === cp.key
                      ? "Click the map…"
                      : cp.lat != null && cp.lng != null
                        ? "Move pin"
                        : "Place pin"}
                  </button>
                  {cp.lat != null && cp.lng != null ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          mapRef.current?.flyTo({ center: [cp.lng as number, cp.lat as number], zoom: 15 })
                        }
                        className="rounded-md border border-[#1E3A5F]/20 px-2.5 py-1 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
                      >
                        Show on map
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCheckpoint(cp.key, { lat: null, lng: null })}
                        className="rounded-md border border-[#1E3A5F]/20 px-2.5 py-1 text-xs font-semibold text-[#1E3A5F]/70 hover:border-red-500 hover:text-red-600"
                      >
                        Clear pin
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-[#1E3A5F]/50">no pin yet</span>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setCheckpoints((list) => list.filter((x) => x.key !== cp.key));
                      if (armedKey === cp.key) setArmedKey(null);
                    }}
                    className="text-xs font-semibold text-[#1E3A5F]/70 transition-colors hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <input
                  value={cp.note}
                  onChange={(e) => updateCheckpoint(cp.key, { note: e.target.value })}
                  placeholder="Note to runners (scan here for the summit story, halfway point…)"
                  className={inputClass}
                />

                {cp.id ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={`${checkpointApiBase}/${cp.id}/download?format=svg`}
                      className="rounded-md bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A5F]/90"
                    >
                      Download SVG (vector)
                    </a>
                    <a
                      href={`${checkpointApiBase}/${cp.id}/download?format=png`}
                      className="rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
                    >
                      Download PNG
                    </a>
                    {cp.audio_url ? (
                      <span className="inline-flex items-center gap-2">
                        <audio src={cp.audio_url} controls preload="none" className="h-8 max-w-[220px]" />
                        <button
                          type="button"
                          disabled={audioBusy === cp.id}
                          onClick={() => cp.id && void removeAudio(cp.id)}
                          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                        >
                          Remove audio
                        </button>
                      </span>
                    ) : (
                      <>
                        <input
                          ref={(el) => {
                            if (cp.id) audioInputs.current[cp.id] = el;
                          }}
                          type="file"
                          accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f && cp.id) void uploadAudio(cp.id, f);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          disabled={audioBusy === cp.id}
                          onClick={() => cp.id && audioInputs.current[cp.id]?.click()}
                          className="rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722] disabled:opacity-50"
                        >
                          {audioBusy === cp.id ? "Uploading…" : "Add audio story (MP3)"}
                        </button>
                      </>
                    )}
                    {cp.scan_url ? (
                      <span className="break-all text-[11px] text-[#1E3A5F]/45">Scan URL: {cp.scan_url}</span>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-[#1E3A5F]/55">
                    Save the race map to generate this sign&apos;s QR code and enable audio upload.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[#1E3A5F]/55">No checkpoints yet — they&apos;re optional.</p>
        )}
      </div>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? "Saving…" : "Save race map"}
        </button>
        <span className="text-xs text-[#1E3A5F]/55">
          Saves the course line, start/finish, aid stations, and checkpoints together.
        </span>
      </div>
    </div>
  );
}

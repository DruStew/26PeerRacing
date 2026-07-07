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

type Props = {
  eventId: string;
  distanceId: string;
  initialCourse: CourseGeoJSON | null;
  venue: { lat: number; lng: number } | null;
};

/** Parse GPX XML into [lng, lat] coords (track points, falling back to route points). */
function parseGpx(xml: string): [number, number][] {
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
function simplifyLine(coords: [number, number][], tolerance: number): [number, number][] {
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
function simplifyForEditor(coords: [number, number][]): [number, number][] {
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

const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60";
const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]";

export function CourseEditor({ eventId, distanceId, initialCourse, venue }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const gpxInputRef = useRef<HTMLInputElement | null>(null);

  const [lengthMeters, setLengthMeters] = useState(() => courseLengthMeters(initialCourse));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recomputeLength = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    const fc = draw.getAll() as unknown as CourseGeoJSON;
    setLengthMeters(courseLengthMeters(fc));
  }, []);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const bounds = courseBounds(initialCourse);
    const center: [number, number] = venue
      ? [venue.lng, venue.lat]
      : bounds
        ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
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
        new mapboxgl.Marker({ color: VENUE_PIN_COLOR }).setLngLat([venue.lng, venue.lat]).addTo(map);
      }
    });

    map.on("draw.create", recomputeLength);
    map.on("draw.update", recomputeLength);
    map.on("draw.delete", recomputeLength);

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [initialCourse, venue, recomputeLength]);

  async function save() {
    const draw = drawRef.current;
    if (!draw) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const fc = draw.getAll() as unknown as CourseGeoJSON;
      const res = await fetch(
        `/api/promoter/events/${eventId}/distances/${distanceId}/course`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ course_geojson: fc.features.length ? fc : null }),
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }
      setNotice(fc.features.length ? "Course saved." : "Course cleared.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  function clearCourse() {
    drawRef.current?.deleteAll();
    recomputeLength();
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
        }). Check the line, then Save course.`,
      );
    } catch {
      setError("Could not read that file.");
    }
  }

  if (!MAPBOX_TOKEN) {
    return (
      <p className="rounded-lg border border-dashed border-[#1E3A5F]/20 bg-[#fafbfc] px-4 py-3 text-sm text-[#1E3A5F]/60">
        Set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment to enable
        the course drawing tool.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="h-96 w-full overflow-hidden rounded-xl" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] px-4 py-3">
        <p className="text-sm text-[#1E3A5F]/80">
          Course length:{" "}
          <span className="font-semibold tabular-nums text-[#1E3A5F]">
            {metersToMiles(lengthMeters).toFixed(2)} mi
          </span>{" "}
          <span className="text-[#1E3A5F]/55">({metersToKm(lengthMeters).toFixed(2)} km)</span>
        </p>
        <p className="text-xs text-[#1E3A5F]/55">
          Use the line tool (top-left) to click out the route, or import a GPX recorded on your
          watch or phone. Drag points to adjust.
        </p>
      </div>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? "Saving…" : "Save course"}
        </button>
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
        <button type="button" onClick={clearCourse} className={btnGhost}>
          Clear course
        </button>
      </div>
    </div>
  );
}

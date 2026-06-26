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

const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60";
const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]";

export function CourseEditor({ eventId, distanceId, initialCourse, venue }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

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
          Use the line tool (top-left) to click out the route. Drag points to adjust.
        </p>
      </div>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? "Saving…" : "Save course"}
        </button>
        <button type="button" onClick={clearCourse} className={btnGhost}>
          Clear course
        </button>
      </div>
    </div>
  );
}

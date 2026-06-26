"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  COURSE_LINE_COLOR,
  MAP_STYLE,
  MAPBOX_TOKEN,
  VENUE_PIN_COLOR,
  courseBounds,
  type CourseGeoJSON,
} from "@/lib/mapbox/config";

type Props = {
  course?: CourseGeoJSON | null;
  venue?: { lat: number; lng: number; label?: string | null } | null;
  /** Tailwind height utility, e.g. "h-72". */
  heightClass?: string;
};

/** Read-only course + venue map for public/racer/follower pages. */
export function CourseMap({ course, venue, heightClass = "h-80" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const bounds = courseBounds(course);
    const center: [number, number] = venue
      ? [venue.lng, venue.lat]
      : bounds
        ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
        : [-98.5795, 39.8283];

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: venue || bounds ? 12 : 3,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    map.on("load", () => {
      if (course?.features?.length) {
        map.addSource("course", { type: "geojson", data: course });
        map.addLayer({
          id: "course-line",
          type: "line",
          source: "course",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": COURSE_LINE_COLOR, "line-width": 4 },
        });
      }

      if (venue) {
        new mapboxgl.Marker({ color: VENUE_PIN_COLOR })
          .setLngLat([venue.lng, venue.lat])
          .setPopup(
            venue.label ? new mapboxgl.Popup({ offset: 24 }).setText(venue.label) : undefined,
          )
          .addTo(map);
      }

      const b = courseBounds(course);
      if (b) {
        map.fitBounds(b as [number, number, number, number], { padding: 48, maxZoom: 15 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [course, venue]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={`flex ${heightClass} w-full items-center justify-center rounded-xl border border-dashed border-[#1E3A5F]/20 bg-[#fafbfc] text-sm text-[#1E3A5F]/55`}
      >
        Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN.
      </div>
    );
  }

  return <div ref={containerRef} className={`${heightClass} w-full overflow-hidden rounded-xl`} />;
}

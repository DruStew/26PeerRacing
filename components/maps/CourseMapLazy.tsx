"use client";

import dynamic from "next/dynamic";

import type { CourseGeoJSON } from "@/lib/mapbox/config";

/** Mapbox GL can't render on the server — load CourseMap client-side only. */
const CourseMap = dynamic(() => import("./CourseMap").then((m) => m.CourseMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 w-full items-center justify-center rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] text-sm text-[#1E3A5F]/55">
      Loading map…
    </div>
  ),
});

export function CourseMapLazy(props: {
  course?: CourseGeoJSON | null;
  venue?: { lat: number; lng: number; label?: string | null } | null;
  heightClass?: string;
}) {
  return <CourseMap {...props} />;
}

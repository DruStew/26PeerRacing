"use client";

import dynamic from "next/dynamic";

import type { CourseGeoJSON } from "@/lib/mapbox/config";

const CourseEditor = dynamic(() => import("./CourseEditor").then((m) => m.CourseEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 w-full items-center justify-center rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] text-sm text-[#1E3A5F]/55">
      Loading course tool…
    </div>
  ),
});

export function CourseEditorLazy(props: {
  eventId: string;
  distanceId: string;
  initialCourse: CourseGeoJSON | null;
  venue: { lat: number; lng: number } | null;
}) {
  return <CourseEditor {...props} />;
}

"use client";

import dynamic from "next/dynamic";

import type { VenueSearchBias } from "@/lib/mapbox/venue-search";

const StartAidStationsEditor = dynamic(
  () => import("./StartAidStationsEditor").then((m) => m.StartAidStationsEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 w-full items-center justify-center rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] text-sm text-[#1E3A5F]/55">
        Loading map…
      </div>
    ),
  },
);

export function StartAidStationsEditorLazy(props: {
  eventId: string;
  distanceId: string;
  initialStart: { name: string; address: string; lat: number | null; lng: number | null };
  initialStations: Array<{
    name: string;
    mile_marker: string | null;
    lat: number | null;
    lng: number | null;
    drop_bags: boolean;
  }>;
  venue: { lat: number; lng: number } | null;
  searchBias?: VenueSearchBias;
}) {
  return <StartAidStationsEditor {...props} />;
}

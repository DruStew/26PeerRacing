"use client";

import dynamic from "next/dynamic";

const VenuePicker = dynamic(() => import("./VenuePicker").then((m) => m.VenuePicker), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 w-full items-center justify-center rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] text-sm text-[#1E3A5F]/55">
      Loading map…
    </div>
  ),
});

export function VenuePickerLazy(props: {
  eventId: string;
  initial: { name: string; address: string; lat: number | null; lng: number | null };
}) {
  return <VenuePicker {...props} />;
}

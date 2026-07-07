"use client";

import { useState } from "react";

import { ShareCardStudio } from "@/components/share/ShareCardStudio";

/**
 * "It's Race Day!" share graphic, tucked behind a small button on My Entries
 * so the page stays tidy — racers pop it open on race morning.
 */
export function RaceDayShareLauncher({
  eventName,
  distanceLabel,
  runnerName,
  sponsorLogoUrl,
}: {
  eventName: string;
  distanceLabel: string;
  runnerName: string | null;
  sponsorLogoUrl: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#E87722]/40 bg-white px-3 py-1.5 text-xs font-semibold text-[#E87722] transition-colors hover:bg-[#E87722]/10"
      >
        <span aria-hidden>📸</span> Make a &ldquo;Race Day&rdquo; post
      </button>
    );
  }

  return (
    <div className="mt-3">
      <ShareCardStudio
        data={{
          kind: "raceday",
          eventName,
          distanceLabel,
          runnerName,
          sponsorLogoUrl,
        }}
        fileBase={`${eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-race-day`}
      />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 text-xs font-semibold text-[#1E3A5F]/60 hover:text-[#1E3A5F]"
      >
        Hide
      </button>
    </div>
  );
}

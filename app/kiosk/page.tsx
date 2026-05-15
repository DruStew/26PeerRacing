import Link from "next/link";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
export default function KioskLandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Peer Racing</p>
        <h1 className="font-display mt-2 text-2xl font-bold text-[#1E3A5F]">Kiosk</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#1E3A5F]/80">
          Open the <strong>event link</strong> your race director shared (it includes this event). You&apos;ll
          enter the 6-digit <strong>kiosk code</strong> there.
        </p>
        <p className="mt-3 text-sm text-[#1E3A5F]/70">
          No personal Peer Racing login is required on check-in tablets.
        </p>
        <Link
          href="/events"
          className="mt-8 inline-flex rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
        >
          Find a race
        </Link>
        <p className="mt-6 text-xs text-[#1E3A5F]/55">
          Director: generate codes on your event&apos;s{" "}
          <Link href="/promoter" className="font-medium text-[#E87722] hover:underline">
            promoter
          </Link>{" "}
          → Race day kiosk page.
        </p>
      </main>
    </div>
  );
}

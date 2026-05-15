import Link from "next/link";
import { notFound } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCalendarDate } from "@/lib/format-calendar-date";

import { KioskLoginClient } from "./KioskLoginClient";

export default async function KioskEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,status")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !event) {
    notFound();
  }

  const status = (event as { status?: string }).status;
  if (status !== "published") {
    notFound();
  }

  const location = [(event as { city?: string }).city, (event as { state?: string }).state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <Link
          href="/kiosk"
          className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#E87722]"
        >
          ← Kiosk Help
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Check-In
        </p>
        <h1 className="font-display mt-2 text-2xl font-bold text-[#1E3A5F]">{(event as { name: string }).name}</h1>
        <p className="mt-1 text-sm text-[#1E3A5F]/70">
          {location || "—"} · {formatCalendarDate((event as { race_date: string }).race_date)}
        </p>
        <p className="mt-6 text-sm text-[#1E3A5F]/80">
          Enter the <strong>6-digit kiosk code</strong> from your race director.
        </p>
        <KioskLoginClient eventId={eventId} />
      </main>
    </div>
  );
}

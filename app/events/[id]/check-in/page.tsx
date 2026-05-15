import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { getKioskSessionFromCookies, kioskCookieName } from "@/lib/kiosk/parse-session-cookie";
import { getServiceOrThrow } from "@/lib/kiosk/ensure-kiosk-row";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { CheckInRunnerClient } from "./CheckInRunnerClient";
import { CheckInTerminalClient } from "./CheckInTerminalClient";

export default async function EventCheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;

  let admin;
  try {
    admin = getServiceOrThrow();
  } catch {
    redirect(`/kiosk/${eventId}`);
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(kioskCookieName())?.value;
  const cookieHeader = raw ? `${kioskCookieName()}=${encodeURIComponent(raw)}` : null;

  const session = await getKioskSessionFromCookies(admin, cookieHeader);
  if (!session || session.terminal.event_id !== eventId) {
    redirect(`/kiosk/${eventId}`);
  }

  const label = `T${session.terminal.terminal_index}`;

  const supabase = await createServerSupabaseClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,name,city,state,race_date")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  const location = [(event as { city?: string }).city, (event as { state?: string }).state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link href={`/events/${eventId}`} className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#E87722]">
          ← Event
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Check-In</p>
        <h1 className="font-display mt-2 text-3xl font-bold text-[#1E3A5F]">{(event as { name: string }).name}</h1>
        <p className="mt-1 text-sm text-[#1E3A5F]/70">
          {location || "—"} · {formatCalendarDate((event as { race_date: string }).race_date)}
        </p>

        <div className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 sm:p-8">
          <p className="font-display text-center text-lg font-semibold text-[#1E3A5F]">Runner Check-In</p>
          <p className="mt-2 text-center text-sm text-[#1E3A5F]/75">
            Search by Peer Racing ID, host-assigned race bib, name, email, or phone; then set timing bib if needed and
            scan RFID transponder codes (aligned with Race Result).
            <span className="mt-1 block text-[#1E3A5F]/65">
              Race staff can assign a one-event bib per distance at check-in; it is stored on that entry and is
              findable from this search for the rest of race day.
            </span>
          </p>
          <Suspense fallback={<p className="mt-6 text-center text-sm text-[#1E3A5F]/70">Loading check-in…</p>}>
            <CheckInRunnerClient eventId={eventId} />
          </Suspense>
        </div>

        <CheckInTerminalClient terminalLabel={label} />
      </main>
    </div>
  );
}

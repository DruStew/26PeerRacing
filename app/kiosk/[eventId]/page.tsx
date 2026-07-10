import { notFound } from "next/navigation";

import { KioskShell } from "@/components/kiosk/KioskShell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCalendarDate } from "@/lib/format-calendar-date";

import { KioskLoginClient } from "./KioskLoginClient";

export default async function KioskEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { eventId } = await params;
  const { next } = await searchParams;

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
  const subtitle = `${location || "—"} · ${formatCalendarDate((event as { race_date: string }).race_date)}`;

  return (
    <KioskShell title={(event as { name: string }).name} subtitle={subtitle}>
      <p className="text-sm text-[#1E3A5F]/80">
        Enter the <strong>6-digit kiosk code</strong> from your race director to open the check-in desk on this
        tablet.
      </p>
      <KioskLoginClient eventId={eventId} next={next ?? null} />
    </KioskShell>
  );
}

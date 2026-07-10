import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RaceControlClient } from "@/components/timing/RaceControlClient";
import { gateTimingPage } from "@/lib/timing/page-auth";

export const dynamic = "force-dynamic";

/**
 * Race Control — the finish-line laptop. Accessible with a kiosk code
 * (volunteer's own laptop) or promoter login.
 */
export default async function RaceControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateTimingPage(id, `/events/${id}/race-control`);
  if (!gate.ok) redirect(gate.redirectTo);

  const service = gate.service;
  const [{ data: event }, { data: distRaw }, { data: entriesRaw }, { data: tagsRaw }] =
    await Promise.all([
      service.from("events").select("id,name,big_screen_public").eq("id", id).maybeSingle(),
      service.from("distances").select("id,label").eq("event_id", id).order("sort_order"),
      service
        .from("entries")
        .select("id,first_name,last_name,assigned_bib,bib,distance_id")
        .eq("event_id", id),
      service.from("timing_tags").select("tag_id,entry_id").eq("event_id", id),
    ]);
  if (!event) notFound();
  const ev = event as { id: string; name: string; big_screen_public: boolean };

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
              Race Control · {ev.name}
            </p>
            <h1 className="font-display mt-1 text-2xl font-bold tracking-tight">Finish Line Command</h1>
          </div>
          <div className="flex gap-3 text-sm">
            <Link
              href={`/events/${ev.id}/finish-cam`}
              className="font-semibold text-[#E87722] hover:underline"
            >
              Finish Cam (phone)
            </Link>
            <Link
              href={`/promoter/events/${ev.id}/timing/review`}
              className="font-semibold text-[#E87722] hover:underline"
            >
              Full review
            </Link>
          </div>
        </div>

        <RaceControlClient
          eventId={ev.id}
          distances={(distRaw ?? []) as { id: string; label: string }[]}
          entries={
            (entriesRaw ?? []) as {
              id: string;
              first_name: string | null;
              last_name: string | null;
              assigned_bib: string | null;
              bib: string | null;
              distance_id: string;
            }[]
          }
          tagBindings={(tagsRaw ?? []) as { tag_id: number; entry_id: string }[]}
          initialBigScreenPublic={ev.big_screen_public === true}
        />
      </main>
    </div>
  );
}

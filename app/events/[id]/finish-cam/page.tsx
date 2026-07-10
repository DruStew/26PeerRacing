import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FinishCamClient } from "@/components/timing/FinishCamClient";
import { gateTimingPage } from "@/lib/timing/page-auth";

export const dynamic = "force-dynamic";

/**
 * Finish Cam capture page — the phone on the tripod. Accessible with a
 * kiosk code (borrowed phone, no login) or promoter login.
 */
export default async function FinishCamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateTimingPage(id, `/events/${id}/finish-cam`);
  if (!gate.ok) redirect(gate.redirectTo);

  const service = gate.service;
  const [{ data: event }, { data: distRaw }] = await Promise.all([
    service.from("events").select("id,name").eq("id", id).maybeSingle(),
    service.from("distances").select("id,label").eq("event_id", id).order("sort_order"),
  ]);
  if (!event) notFound();
  const ev = event as { id: string; name: string };
  const distances = (distRaw ?? []) as { id: string; label: string }[];

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
              Finish Cam · {ev.name}
            </p>
            <h1 className="font-display mt-1 text-2xl font-bold tracking-tight">This phone is the camera</h1>
          </div>
          <Link
            href={`/events/${ev.id}/race-control`}
            className="text-sm font-semibold text-[#E87722] hover:underline"
          >
            Race Control →
          </Link>
        </div>

        {distances.length === 0 ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Add at least one distance to this event before timing.
          </p>
        ) : (
          <FinishCamClient eventId={ev.id} distances={distances} />
        )}
      </main>
    </div>
  );
}

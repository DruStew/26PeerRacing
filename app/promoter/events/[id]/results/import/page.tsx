import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EventNav } from "@/components/promoter/EventNav";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { ResultsImportClient } from "@/components/promoter/ResultsImportClient";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ResultsImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/results/import`)}`);
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,promoter_id")
    .eq("id", id)
    .single();

  if (error || !event) {
    notFound();
  }

  if (!(await canManageEvent(supabase, auth.user.id, (event as { promoter_id?: string }).promoter_id))) {
    notFound();
  }

  const { data: distancesRaw } = await supabase
    .from("distances")
    .select("id,label")
    .eq("event_id", id)
    .order("gun_time", { ascending: true, nullsFirst: true });

  const distances =
    distancesRaw?.map((d) => ({
      id: (d as { id: string }).id,
      label: (d as { label: string }).label,
    })) ?? [];

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <LandingNavbar />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={`/promoter/events/${id}/results`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to results console
        </Link>

        <EventNav eventId={id} current="results" />

        <div className="mt-6 border-b border-[#1E3A5F]/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Race night</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            Finish-Time Import
          </h1>
          <p className="mt-2 text-sm text-[#1E3A5F]/75">{event.name}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1E3A5F]/70">
            Upload the timing company&apos;s CSV for each distance. Rows match to registered runners
            automatically; anything the file can&apos;t identify lands in the review list below so
            nobody loses a finish over a typo.
          </p>
        </div>

        <div className="mt-10">
          {distances.length === 0 ? (
            <p className="text-sm text-[#1E3A5F]/70">
              This event has no distances yet. Add distances in the event editor first.
            </p>
          ) : (
            <ResultsImportClient eventId={id} distances={distances} />
          )}
        </div>
      </main>
    </div>
  );
}

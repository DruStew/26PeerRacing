import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EventNav } from "@/components/promoter/EventNav";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { ResultsConsoleClient } from "@/components/promoter/ResultsConsoleClient";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function EventResultsConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/results`)}`);
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,promoter_id")
    .eq("id", id)
    .single();

  if (error || !event) {
    notFound();
  }

  const promoterId = (event as { promoter_id?: string }).promoter_id;
  if (!(await canManageEvent(supabase, auth.user.id, promoterId))) {
    notFound();
  }

  const { data: distancesRaw } = await supabase
    .from("distances")
    .select("id,label,entry_fee_cents")
    .eq("event_id", id)
    .order("gun_time", { ascending: true, nullsFirst: true });

  const distances =
    distancesRaw?.map((d) => ({
      id: (d as { id: string }).id,
      label: (d as { label: string }).label,
      entry_fee_cents: Math.max(0, (d as { entry_fee_cents: number }).entry_fee_cents ?? 0),
    })) ?? [];

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <LandingNavbar />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={`/promoter/events/${id}/edit`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to event
        </Link>

        <EventNav eventId={id} current="results" />

        <div className="mt-6 border-b border-[#1E3A5F]/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Race night</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            Results Console
          </h1>
          <p className="mt-2 text-sm text-[#1E3A5F]/75">{event.name}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1E3A5F]/70">
            Run the Peer Racing algorithm on a race&apos;s finish times: divisions form from the field, badges and
            payouts fall into place, and you can tweak the percentile ends for outliers before publishing. Dollar
            amounts come from this distance&apos;s saved payout calculator settings.
          </p>
          <Link
            href={`/promoter/events/${id}/results/import`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[#1E3A5F]/20 bg-white px-4 py-2 text-sm font-semibold text-[#1E3A5F] shadow-sm transition-colors hover:border-[#E87722] hover:text-[#E87722]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5 5 5M12 4v12" />
            </svg>
            Import finish times (timing CSV)
          </Link>
        </div>

        <div className="mt-10">
          <ResultsConsoleClient eventId={id} distances={distances} />
        </div>
      </main>
    </div>
  );
}

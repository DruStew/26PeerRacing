import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EventNav } from "@/components/promoter/EventNav";
import { EventPayoutClient } from "@/components/promoter/EventPayoutClient";
import { EventPrizeAwardsClient } from "@/components/promoter/EventPrizeAwardsClient";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function EventPayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/payout`)}`);
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,promoter_id,is_demo")
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

        <EventNav eventId={id} current="payout" isDemo={(event as { is_demo?: boolean }).is_demo === true} />

        <div className="mt-6 border-b border-[#1E3A5F]/10 pb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Producer finances</p>
              <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">Payout Calculator</h1>
              <p className="mt-2 text-sm text-[#1E3A5F]/75">{event.name}</p>
            </div>
            <Link
              href="/promoter/shootout-fund"
              className="inline-flex shrink-0 items-center justify-center rounded-md border-2 border-[#E87722]/40 px-4 py-2 text-sm font-semibold text-[#E87722] transition-colors hover:bg-[#E87722]/5"
            >
              View shootout fund
            </Link>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1E3A5F]/70">
            Pick a race distance — each has its own pot, saved settings, and payouts. Entry fee and entry count default from
            that distance. Percentages are entered as whole numbers (e.g. 50 for 50%). Money shows in dollars.
          </p>
        </div>

        <div className="mt-10">
          <EventPayoutClient eventId={id} distances={distances} />
        </div>
        <div className="mt-10">
          <EventPrizeAwardsClient eventId={id} distances={distances} />
        </div>
      </main>
    </div>
  );
}

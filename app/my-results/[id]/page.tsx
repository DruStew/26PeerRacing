import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DivisionBadge, DIVISION_COLORS } from "@/components/results/DivisionBadge";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { MY_RESULTS_ROUTE } from "@/lib/routes";
import {
  formatFinishTime,
  formatUsd,
  loadRacerResult,
  ordinal,
} from "@/lib/results-racer";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export default async function RacerResultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`${MY_RESULTS_ROUTE}/${id}`)}`);
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const loaded = await loadRacerResult(service, user.id, id);
  if (!loaded) notFound();

  const { result: r, overallFinishers, divisionFinishers } = loaded;
  const location = [r.city, r.state].filter(Boolean).join(", ");
  const accent = (r.division && DIVISION_COLORS[r.division]) || DIVISION_COLORS.Echo;

  const moneyLines: { label: string; cents: number }[] = [];
  if (r.payoutCents > 0 && r.division) {
    moneyLines.push({ label: `${r.division} Division — ${ordinal(r.divisionPlace)}`, cents: r.payoutCents });
  }
  if (r.femaleIncentivePayoutCents > 0) {
    moneyLines.push({
      label: `Female incentive — ${ordinal(r.femaleIncentivePlace)}`,
      cents: r.femaleIncentivePayoutCents,
    });
  }
  if (r.militaryIncentivePayoutCents > 0) {
    moneyLines.push({
      label: `Military incentive — ${ordinal(r.militaryIncentivePlace)}`,
      cents: r.militaryIncentivePayoutCents,
    });
  }
  const totalWon = moneyLines.reduce((s, m) => s + m.cents, 0);

  return (
    <div className="min-h-screen bg-[#fafbfc] font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={MY_RESULTS_ROUTE}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          My Results
        </Link>

        {/* hero */}
        <section
          className="relative mt-6 overflow-hidden rounded-2xl border border-[#1E3A5F]/10 bg-white p-6 text-center shadow-sm sm:p-10"
          style={{ borderTopColor: accent.base, borderTopWidth: 4 }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/55">
            {r.eventName}
          </p>
          <p className="mt-1 text-sm text-[#1E3A5F]/70">
            {r.distanceLabel}
            {r.raceDate ? ` · ${formatCalendarDate(r.raceDate)}` : ""}
            {location ? ` · ${location}` : ""}
          </p>

          {r.division ? (
            <div className="mt-6 flex flex-col items-center gap-3">
              <DivisionBadge division={r.division} size={140} />
              <p className="font-display text-2xl font-bold tracking-tight text-[#1E3A5F]">
                {r.division} Division
              </p>
            </div>
          ) : null}

          {totalWon > 0 ? (
            <div className="mt-6 inline-flex flex-col items-center rounded-xl border-2 border-[#E87722]/30 bg-[#E87722]/5 px-8 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#E87722]">You won</p>
              <p className="font-display text-4xl font-bold text-[#1E3A5F]">{formatUsd(totalWon)}</p>
            </div>
          ) : null}
        </section>

        {/* stat tiles */}
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">Finish time</p>
            <p className="font-display mt-1 text-2xl font-bold tabular-nums text-[#1E3A5F]">
              {formatFinishTime(r.finishTimeMs)}
            </p>
          </div>
          <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">Overall</p>
            <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">
              {r.overallRank ? ordinal(r.overallRank) : "—"}
            </p>
            {overallFinishers > 0 ? (
              <p className="mt-0.5 text-xs text-[#1E3A5F]/55">of {overallFinishers} finishers</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
              Division place
            </p>
            <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">
              {r.divisionPlace ? ordinal(r.divisionPlace) : "—"}
            </p>
            {r.division && divisionFinishers > 0 ? (
              <p className="mt-0.5 text-xs text-[#1E3A5F]/55">
                of {divisionFinishers} in {r.division}
              </p>
            ) : null}
          </div>
        </section>

        {/* money breakdown */}
        {moneyLines.length > 0 ? (
          <section className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Payout Breakdown</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {moneyLines.map((m) => (
                <div key={m.label} className="flex items-center justify-between gap-4">
                  <dt className="text-[#1E3A5F]/75">{m.label}</dt>
                  <dd className="font-semibold tabular-nums text-[#1E3A5F]">{formatUsd(m.cents)}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 border-t border-[#1E3A5F]/10 pt-2">
                <dt className="font-semibold text-[#1E3A5F]">Total</dt>
                <dd className="font-display text-lg font-bold tabular-nums text-[#E87722]">
                  {formatUsd(totalWon)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-[#1E3A5F]/55">
              Winnings are credited to your Peer Racing wallet.
            </p>
          </section>
        ) : (
          <section className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-[#1E3A5F]/70">
              No payout for this race — but the {r.division ?? "division"} badge is yours, and every
              finish builds your record. On to the next one.
            </p>
          </section>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
          <Link
            href={`/events/${r.eventId}/results/${r.distanceId}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            Full race results
          </Link>
          <Link
            href={`/events/${r.eventId}`}
            className="inline-flex items-center justify-center rounded-md border-2 border-[#1E3A5F]/20 px-5 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
          >
            Event details
          </Link>
          <Link
            href={MY_RESULTS_ROUTE}
            className="inline-flex items-center justify-center rounded-md border-2 border-[#1E3A5F]/20 px-5 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
          >
            All my results
          </Link>
        </div>
      </main>
    </div>
  );
}

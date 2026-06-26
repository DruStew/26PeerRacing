import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { loadPromoterScopedRacerHistory } from "@/lib/promoter-racer-history";
import { formatFinishTime, formatUsd, ordinal } from "@/lib/results-racer";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export default async function PromoterRacerHistoryPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const { id, userId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/racer/${userId}`)}`);
  }

  const { data: event } = await supabase
    .from("events")
    .select("id,name,promoter_id")
    .eq("id", id)
    .single();
  if (!event) notFound();

  const promoterId = (event as { promoter_id?: string }).promoter_id;
  if (!(await canManageEvent(supabase, auth.user.id, promoterId))) {
    notFound();
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { racer, results } = await loadPromoterScopedRacerHistory(service, promoterId as string, userId);

  const totalWon = results.reduce((s, r) => s + r.payoutCents, 0);

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <LandingNavbar />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={`/promoter/events/${id}/results`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to results console
        </Link>

        <div className="mt-6 border-b border-[#1E3A5F]/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Racer history</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            {racer?.name ?? "Racer"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#1E3A5F]/70">
            {racer?.prId ? <span className="font-mono">PR {racer.prId}</span> : null}
            <span>
              {results.length} {results.length === 1 ? "race" : "races"} at your events
            </span>
            {totalWon > 0 ? (
              <span className="font-semibold text-[#E87722]">{formatUsd(totalWon)} won</span>
            ) : null}
          </div>
          <p className="mt-3 max-w-2xl text-xs text-[#1E3A5F]/55">
            Results from races you produce only. This is not the racer&apos;s full profile or history at other
            promoters&apos; events.
          </p>
        </div>

        {results.length === 0 ? (
          <div className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-white px-6 py-12 text-center">
            <p className="text-[#1E3A5F]/75">No results for this racer at your events yet.</p>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[#1E3A5F]/10 text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Race</th>
                  <th className="px-4 py-3 text-right">Time</th>
                  <th className="px-4 py-3 text-right">Overall</th>
                  <th className="px-4 py-3 text-right">Division</th>
                  <th className="px-4 py-3 text-right">Won</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const location = [r.city, r.state].filter(Boolean).join(", ");
                  return (
                    <tr key={r.id} className="border-b border-[#1E3A5F]/5 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#1E3A5F]">{r.eventName}</p>
                        <p className="text-xs text-[#1E3A5F]/55">
                          {[location, r.raceDate ? formatCalendarDate(r.raceDate) : null]
                            .filter(Boolean)
                            .join(" · ")}
                          {!r.published ? " · provisional" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[#1E3A5F]/85">{r.distanceLabel}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[#1E3A5F]/85">
                        {formatFinishTime(r.finishTimeMs)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#1E3A5F]/85">
                        {r.overallRank ? ordinal(r.overallRank) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#1E3A5F]/85">
                        {r.division && r.divisionPlace ? `${ordinal(r.divisionPlace)} ${r.division}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#E87722]">
                        {r.payoutCents > 0 ? formatUsd(r.payoutCents) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

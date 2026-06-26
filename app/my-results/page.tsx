import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DivisionBadge, type BadgeVariant } from "@/components/results/DivisionBadge";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { DEFAULT_PUBLIC_ROUTE, MY_RESULTS_ROUTE } from "@/lib/routes";
import {
  formatFinishTime,
  formatUsd,
  loadRacerBadges,
  loadRacerResults,
  ordinal,
} from "@/lib/results-racer";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function badgeVariant(key: string): BadgeVariant {
  if (key === "female_incentive") return "female";
  if (key === "military_incentive") return "military";
  return "main";
}

export default async function MyResultsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(MY_RESULTS_ROUTE)}`);
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const [results, badges] = await Promise.all([
    loadRacerResults(service, user.id),
    loadRacerBadges(service, user.id),
  ]);

  const totalWonCents = results.reduce(
    (sum, r) =>
      sum + r.payoutCents + r.femaleIncentivePayoutCents + r.militaryIncentivePayoutCents,
    0,
  );

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Your Races
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          My Results
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
          Every race you&apos;ve finished, the division you earned, where you placed, and the money you
          won. Badges land in your trophy case the moment a producer publishes results.
        </p>

        {results.length === 0 ? (
          <div className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] px-6 py-12 text-center">
            <p className="text-[#1E3A5F]/80">
              No published results yet. Once you finish a race and the producer publishes, your
              result and badges show up here.
            </p>
            <Link
              href={DEFAULT_PUBLIC_ROUTE}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
            >
              Find a race
            </Link>
          </div>
        ) : (
          <>
            {/* headline stats */}
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                  Races finished
                </p>
                <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">{results.length}</p>
              </div>
              <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                  Badges earned
                </p>
                <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">{badges.length}</p>
              </div>
              <div className="col-span-2 rounded-xl border-2 border-[#E87722]/30 bg-[#E87722]/5 p-5 shadow-sm sm:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#E87722]">
                  Total won
                </p>
                <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">
                  {formatUsd(totalWonCents)}
                </p>
              </div>
            </div>

            {/* trophy case */}
            {badges.length > 0 ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Trophy Case</h2>
                <p className="mt-1 text-sm text-[#1E3A5F]/65">
                  Badges you&apos;ve earned across every Peer Racing event.
                </p>
                <div className="mt-5 flex flex-wrap gap-5">
                  {badges.map((b) => {
                    const variant = badgeVariant(b.badgeKey);
                    const division = b.division ?? "Echo";
                    const inner = (
                      <span className="flex w-24 flex-col items-center gap-1.5 text-center">
                        <DivisionBadge division={division} variant={variant} size={84} />
                        <span className="text-xs font-semibold text-[#1E3A5F]">
                          {b.divisionPlace ? `${ordinal(b.divisionPlace)} place` : b.badgeTitle}
                        </span>
                        {b.payoutCents > 0 ? (
                          <span className="text-xs font-medium text-[#E87722]">
                            {formatUsd(b.payoutCents)}
                          </span>
                        ) : null}
                      </span>
                    );
                    return b.resultId ? (
                      <Link
                        key={b.id}
                        href={`${MY_RESULTS_ROUTE}/${b.resultId}`}
                        className="rounded-lg outline-none transition-transform hover:-translate-y-1 focus-visible:-translate-y-1"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div key={b.id}>{inner}</div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* per-race results */}
            <section className="mt-12">
              <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Race Results</h2>
              <ul className="mt-5 space-y-4">
                {results.map((r) => {
                  const location = [r.city, r.state].filter(Boolean).join(", ");
                  const moneyWon =
                    r.payoutCents + r.femaleIncentivePayoutCents + r.militaryIncentivePayoutCents;
                  return (
                    <li key={r.id}>
                      <Link
                        href={`${MY_RESULTS_ROUTE}/${r.id}`}
                        className="group flex flex-col gap-4 rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm transition-all hover:border-[#E87722]/50 hover:shadow-md sm:flex-row sm:items-center"
                      >
                        {r.division ? (
                          <DivisionBadge division={r.division} size={64} />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-lg font-semibold text-[#1E3A5F] transition-colors group-hover:text-[#E87722]">
                            {r.eventName}
                          </p>
                          <p className="mt-0.5 text-sm text-[#1E3A5F]/70">
                            {r.distanceLabel}
                            {r.raceDate ? ` · ${formatCalendarDate(r.raceDate)}` : ""}
                            {location ? ` · ${location}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#1E3A5F]/80">
                            <span>
                              <span className="font-semibold text-[#1E3A5F]">
                                {formatFinishTime(r.finishTimeMs)}
                              </span>{" "}
                              finish
                            </span>
                            {r.overallRank ? <span>{ordinal(r.overallRank)} overall</span> : null}
                            {r.division && r.divisionPlace ? (
                              <span>
                                {ordinal(r.divisionPlace)} in {r.division}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {moneyWon > 0 ? (
                            <p className="font-display text-xl font-bold text-[#E87722]">
                              {formatUsd(moneyWon)}
                            </p>
                          ) : (
                            <p className="text-sm text-[#1E3A5F]/45">No payout</p>
                          )}
                          <span className="mt-1 inline-flex items-center text-sm font-semibold text-[#E87722] group-hover:underline">
                            View result →
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        <p className="mt-10 text-center text-sm text-[#1E3A5F]/70 sm:text-left">
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="font-medium text-[#E87722] underline-offset-2 transition-colors hover:underline"
          >
            Back to Upcoming Races
          </Link>
        </p>
      </main>
    </div>
  );
}

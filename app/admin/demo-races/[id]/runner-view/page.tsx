import Link from "next/link";
import { notFound } from "next/navigation";

import { DivisionBadge } from "@/components/results/DivisionBadge";
import { ShareCardStudio } from "@/components/share/ShareCardStudio";
import { loadDemoRunnerIndex, loadDemoRunnerView } from "@/lib/demo/runner-view";
import { resolveSponsorLogo } from "@/lib/share/sponsor";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { formatFinishTime, formatUsd, ordinal } from "@/lib/results-racer";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/**
 * Demo-only "what the racer sees": renders a My Results-style page for any
 * imported demo runner, computed live from finish times + payout settings.
 * Super-admin gated by the demo-races layout; nothing is published or written.
 */
export default async function DemoRunnerViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
  const { id } = await params;
  const { entry: selectedEntryId } = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,race_date,city,state,is_demo")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!event || !(event as { is_demo?: boolean }).is_demo) notFound();

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const people = await loadDemoRunnerIndex(service, id);
  const view = selectedEntryId ? await loadDemoRunnerView(service, id, selectedEntryId) : null;
  const location = [event.city, event.state].filter(Boolean).join(", ");

  // Share studio inputs: the runner's primary finished race + sponsor logo.
  const shareResult = view?.results.find((r) => r.finishTimeMs != null) ?? view?.results[0] ?? null;
  const shareSponsorLogo = shareResult
    ? await resolveSponsorLogo(service, id, shareResult.distanceId)
    : null;
  const shareData =
    view && shareResult
      ? {
          kind: "finish" as const,
          eventName: event.name as string,
          distanceLabel: shareResult.distanceLabel,
          runnerName: view.name,
          timeText: shareResult.finishTimeMs != null ? formatFinishTime(shareResult.finishTimeMs) : null,
          division: shareResult.division,
          divisionPlaceText: shareResult.divisionPlace
            ? ordinal(shareResult.divisionPlace).toUpperCase()
            : null,
          overallText:
            shareResult.overallRank != null
              ? `${ordinal(shareResult.overallRank).toUpperCase()} OF ${shareResult.overallFinishers} OVERALL`
              : null,
          femalePoolText:
            shareResult.femaleIncentivePlace != null
              ? `${ordinal(shareResult.femaleIncentivePlace).toUpperCase()} FEMALE POOL${
                  shareResult.femaleIncentivePayoutCents > 0
                    ? ` · ${formatUsd(shareResult.femaleIncentivePayoutCents)}`
                    : ""
                }`
              : null,
          militaryPoolText:
            shareResult.militaryIncentivePlace != null
              ? `${ordinal(shareResult.militaryIncentivePlace).toUpperCase()} MILITARY POOL${
                  shareResult.militaryIncentivePayoutCents > 0
                    ? ` · ${formatUsd(shareResult.militaryIncentivePayoutCents)}`
                    : ""
                }`
              : null,
          moneyLines:
            shareResult.payoutCents > 0 && shareResult.division
              ? [
                  {
                    label: `${shareResult.division.toUpperCase()} DIVISION`,
                    amountText: formatUsd(shareResult.payoutCents),
                  },
                ]
              : [],
          totalWonText: view.totalWonCents > 0 ? formatUsd(view.totalWonCents) : null,
          sponsorLogoUrl: shareSponsorLogo,
        }
      : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
      <Link
        href={`/admin/demo-races/${id}`}
        className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#E87722]"
      >
        ← Demo race hub
      </Link>

      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        Demo preview — this is what the runner&apos;s own &ldquo;My Results&rdquo; page would show
        after results publish. Computed live; nothing is published or saved.
      </div>

      <h1 className="font-display mt-8 text-3xl font-bold text-[#1E3A5F]">Runner View</h1>
      <p className="mt-1 text-sm text-[#1E3A5F]/65">
        {event.name} · {formatCalendarDate(event.race_date as string)}
        {location ? ` · ${location}` : ""}
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-[#1E3A5F]">
          Pick a runner ({people.length}) — winners sorted to the top
        </h2>
        {people.length === 0 ? (
          <p className="mt-3 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 text-sm text-[#1E3A5F]/60">
            No participants yet — import a roster from the demo hub first.
          </p>
        ) : (
          <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-xl border border-[#1E3A5F]/10 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_rgba(30,58,95,0.1)]">
                <tr className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                  <th className="px-4 py-2.5">Runner</th>
                  <th className="px-4 py-2.5">Bib</th>
                  <th className="px-4 py-2.5">Races & placement</th>
                  <th className="px-4 py-2.5 text-right">Won</th>
                  <th className="px-4 py-2.5" aria-label="View" />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const isSelected = selectedEntryId === p.entryId;
                  return (
                    <tr
                      key={p.entryId}
                      className={`border-t border-[#1E3A5F]/5 transition-colors hover:bg-[#fafbfc] ${
                        isSelected ? "bg-[#E87722]/10" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-[#1E3A5F]">
                        <Link
                          href={`/admin/demo-races/${id}/runner-view?entry=${p.entryId}`}
                          className="hover:text-[#E87722]"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[#1E3A5F]/80">{p.bib ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {p.races.map((race, i) => {
                            const placedHere =
                              race.divisionPlace != null ||
                              race.femaleIncentivePlace != null ||
                              race.militaryIncentivePlace != null;
                            const parts = [
                              race.division && race.divisionPlace
                                ? `${race.division} ${ordinal(race.divisionPlace)}`
                                : null,
                              race.femaleIncentivePlace != null
                                ? `F-pool ${ordinal(race.femaleIncentivePlace)}`
                                : null,
                              race.militaryIncentivePlace != null
                                ? `Mil ${ordinal(race.militaryIncentivePlace)}`
                                : null,
                            ].filter(Boolean);
                            return (
                              <span
                                key={`${p.entryId}-${i}`}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                                  placedHere
                                    ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                                    : race.finishTimeMs != null
                                      ? "bg-[#1E3A5F]/5 text-[#1E3A5F]/80 ring-[#1E3A5F]/15"
                                      : "bg-amber-50 text-amber-800 ring-amber-200"
                                }`}
                              >
                                {race.distanceLabel}
                                {race.finishTimeMs != null
                                  ? ` · ${formatFinishTime(race.finishTimeMs)}`
                                  : " · no time"}
                                {parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {p.totalWonCents > 0 ? (
                          <span className="font-semibold text-[#E87722]">
                            {formatUsd(p.totalWonCents)}
                          </span>
                        ) : (
                          <span className="text-[#1E3A5F]/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/admin/demo-races/${id}/runner-view?entry=${p.entryId}`}
                          className="rounded-md bg-[#E87722] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#E87722]/90"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedEntryId && !view ? (
        <p className="mt-8 text-sm text-red-600">Runner not found for this event.</p>
      ) : null}

      {view ? (
        <div className="mt-10 rounded-2xl border-2 border-[#1E3A5F]/10 bg-white p-6 shadow-sm sm:p-8">
          {/* what the runner sees */}
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
            {view.name}&apos;s My Results
          </p>
          <h2 className="font-display mt-2 text-2xl font-bold text-[#1E3A5F]">
            {view.name}
            {view.bib ? (
              <span className="ml-3 align-middle font-mono text-base font-semibold text-[#1E3A5F]/60">
                #{view.bib}
              </span>
            ) : null}
          </h2>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                Races finished
              </p>
              <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">
                {view.results.filter((r) => r.finishTimeMs != null).length}
              </p>
            </div>
            <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                Badges earned
              </p>
              <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">
                {view.badges.length}
              </p>
            </div>
            <div className="col-span-2 rounded-xl border-2 border-[#E87722]/30 bg-[#E87722]/5 p-4 sm:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#E87722]">
                Total won
              </p>
              <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">
                {formatUsd(view.totalWonCents)}
              </p>
            </div>
          </div>

          {view.badges.length > 0 ? (
            <section className="mt-8">
              <h3 className="font-display text-lg font-semibold text-[#1E3A5F]">Trophy Case</h3>
              <div className="mt-4 flex flex-wrap gap-5">
                {view.badges.map((b, i) => (
                  <span key={`${b.key}-${i}`} className="flex w-24 flex-col items-center gap-1.5 text-center">
                    <DivisionBadge division={b.division} variant={b.variant} size={84} />
                    <span className="text-xs font-semibold text-[#1E3A5F]">
                      {b.place ? `${ordinal(b.place)} place` : b.title}
                    </span>
                    {b.payoutCents > 0 ? (
                      <span className="text-xs font-medium text-[#E87722]">
                        {formatUsd(b.payoutCents)}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {shareData ? (
            <section className="mt-8">
              <ShareCardStudio
                data={shareData}
                fileBase={`${(event.name as string).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-finish`}
              />
            </section>
          ) : null}

          <section className="mt-8">
            <h3 className="font-display text-lg font-semibold text-[#1E3A5F]">Race Results</h3>
            <ul className="mt-4 space-y-4">
              {view.results.map((r) => {
                const moneyWon =
                  r.payoutCents + r.femaleIncentivePayoutCents + r.militaryIncentivePayoutCents;
                return (
                  <li
                    key={r.distanceId}
                    className="flex flex-col gap-4 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-5 sm:flex-row sm:items-center"
                  >
                    {r.division ? <DivisionBadge division={r.division} size={64} /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-semibold text-[#1E3A5F]">
                        {r.distanceLabel}
                      </p>
                      {r.note ? (
                        <p className="mt-1 text-sm text-amber-700">{r.note}</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#1E3A5F]/80">
                          <span>
                            <span className="font-semibold text-[#1E3A5F]">
                              {formatFinishTime(r.finishTimeMs)}
                            </span>{" "}
                            finish
                          </span>
                          {r.overallRank ? (
                            <span>
                              {ordinal(r.overallRank)} of {r.overallFinishers} overall
                            </span>
                          ) : null}
                          {r.division && r.divisionPlace ? (
                            <span>
                              {ordinal(r.divisionPlace)} in {r.division}
                            </span>
                          ) : null}
                          {r.femaleIncentivePlace && r.femaleIncentiveDivision ? (
                            <span className="text-[#D6336C]">
                              {ordinal(r.femaleIncentivePlace)} female pool ({r.femaleIncentiveDivision})
                            </span>
                          ) : null}
                          {r.militaryIncentivePlace && r.militaryIncentiveDivision ? (
                            <span className="text-[#5C6B2F]">
                              {ordinal(r.militaryIncentivePlace)} military pool ({r.militaryIncentiveDivision})
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {moneyWon > 0 ? (
                        <p className="font-display text-xl font-bold text-[#E87722]">
                          {formatUsd(moneyWon)}
                        </p>
                      ) : (
                        <p className="text-sm text-[#1E3A5F]/45">No payout</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : null}
    </main>
  );
}

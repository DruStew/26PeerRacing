import { requireFinanceAdmin } from "@/lib/admin/require-finance-admin";
import { loadFinanceDashboardStats } from "@/lib/admin/load-finance-stats";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { formatUsdFromCents } from "@/lib/wallet/format-money";

function StatCard({
  label,
  lifetime,
  ytd,
  hint,
}: {
  label: string;
  lifetime: string;
  ytd: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">{label}</p>
      <p className="font-display mt-2 text-2xl font-bold tabular-nums text-[#1E3A5F]">{lifetime}</p>
      <p className="mt-1 text-sm text-[#1E3A5F]/70">
        YTD: <span className="font-semibold tabular-nums">{ytd}</span>
      </p>
      {hint ? <p className="mt-2 text-xs text-[#1E3A5F]/55">{hint}</p> : null}
    </div>
  );
}

export default async function AdminFinancePage() {
  await requireFinanceAdmin("/admin/finance");

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const stats = await loadFinanceDashboardStats(service);
  const { lifetime, ytd, recentSnapshots } = stats;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
        Internal · Finance
      </p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
        Financial Overview
      </h1>
      <p className="mt-3 max-w-3xl text-pretty text-[#1E3A5F]/75">
        Platform-wide totals from published race snapshots. Runner payouts and check counts reflect
        official published results. Promoter earnings are the producer cut from PR holding — separate
        from racer winnings and never included in a racer&apos;s &ldquo;Total won&rdquo; stat.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Headline Metrics</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Checks paid out"
            lifetime={lifetime.checksPaid.toLocaleString()}
            ytd={ytd.checksPaid.toLocaleString()}
            hint="Each paying division or incentive line on published results"
          />
          <StatCard
            label="Paid to runners"
            lifetime={formatUsdFromCents(lifetime.runnerPayoutCents)}
            ytd={formatUsdFromCents(ytd.runnerPayoutCents)}
            hint="Main division + incentive payouts from published results"
          />
          <StatCard
            label="Promoter earnings"
            lifetime={formatUsdFromCents(lifetime.promoterEarningsCents)}
            ytd={formatUsdFromCents(ytd.promoterEarningsCents)}
            hint="Producer cut credited to promoter wallets on publish"
          />
          <StatCard
            label="Physical prizes awarded"
            lifetime={lifetime.prizeAwardCount.toLocaleString()}
            ytd={ytd.prizeAwardCount.toLocaleString()}
            hint={`${formatUsdFromCents(lifetime.prizeCostCents)} lifetime company cost`}
          />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Full Breakdown</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E3A5F]/10 bg-[#fafbfc] text-left text-xs uppercase tracking-wide text-[#1E3A5F]/55">
                <th className="px-4 py-3 font-semibold">Metric</th>
                <th className="px-4 py-3 font-semibold text-right">Lifetime</th>
                <th className="px-4 py-3 font-semibold text-right">YTD</th>
              </tr>
            </thead>
            <tbody className="text-[#1E3A5F]/85">
              {[
                ["Published distances", lifetime.publishedDistances, ytd.publishedDistances, false],
                ["Gross entry pot", lifetime.grossPotCents, ytd.grossPotCents, true],
                ["Processing fees", lifetime.processingFeeCents, ytd.processingFeeCents, true],
                ["Shootout fund held", lifetime.shootoutFundCents, ytd.shootoutFundCents, true],
                ["PR holding", lifetime.prHoldingCents, ytd.prHoldingCents, true],
                ["Paid to runners", lifetime.runnerPayoutCents, ytd.runnerPayoutCents, true],
                ["Physical prize cost", lifetime.prizeCostCents, ytd.prizeCostCents, true],
                ["Guaranteed cash shortfall", lifetime.companyFundedCashShortfallCents, ytd.companyFundedCashShortfallCents, true],
                ["Physical prize retail value", lifetime.prizeRetailValueCents, ytd.prizeRetailValueCents, true],
                ["Physical prizes awarded", lifetime.prizeAwardCount, ytd.prizeAwardCount, false],
                ["Promoter earnings", lifetime.promoterEarningsCents, ytd.promoterEarningsCents, true],
                ["Peer Racing org share", lifetime.peerRacingOrgCents, ytd.peerRacingOrgCents, true],
              ].map(([label, life, year, isMoney]) => (
                <tr key={String(label)} className="border-b border-[#1E3A5F]/5 last:border-0">
                  <td className="px-4 py-3">{label}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {isMoney
                      ? formatUsdFromCents(Number(life))
                      : Number(life).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {isMoney ? formatUsdFromCents(Number(year)) : Number(year).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Recent Published Races</h2>
        {recentSnapshots.length === 0 ? (
          <p className="mt-3 text-sm text-[#1E3A5F]/65">
            No financial snapshots yet. Publish (or re-publish) a distance, or run the promoter-finance
            backfill for races published before this feature shipped.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E3A5F]/10 bg-[#fafbfc] text-left text-xs uppercase tracking-wide text-[#1E3A5F]/55">
                  <th className="px-4 py-3 font-semibold">Event · Distance</th>
                  <th className="px-4 py-3 font-semibold">Published</th>
                  <th className="px-4 py-3 font-semibold text-right">Checks</th>
                  <th className="px-4 py-3 font-semibold text-right">Runners</th>
                  <th className="px-4 py-3 font-semibold text-right">Prize cost</th>
                  <th className="px-4 py-3 font-semibold text-right">Promoter</th>
                  <th className="px-4 py-3 font-semibold text-right">PR org</th>
                  <th className="px-4 py-3 font-semibold text-right">Gross pot</th>
                </tr>
              </thead>
              <tbody>
                {recentSnapshots.map((row) => (
                  <tr key={`${row.eventName}-${row.distanceLabel}-${row.publishedAt}`} className="border-b border-[#1E3A5F]/5 last:border-0">
                    <td className="px-4 py-3 font-medium text-[#1E3A5F]">
                      {row.eventName} · {row.distanceLabel}
                    </td>
                    <td className="px-4 py-3 text-[#1E3A5F]/70">
                      {new Date(row.publishedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.checksPaid}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsdFromCents(row.runnerPayoutCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsdFromCents(row.prizeCostCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsdFromCents(row.producerCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsdFromCents(row.peerRacingOrgCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsdFromCents(row.grossPotCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type FinancePeriodStats = {
  checksPaid: number;
  runnerPayoutCents: number;
  prizeCostCents: number;
  prizeRetailValueCents: number;
  prizeAwardCount: number;
  companyFundedCashShortfallCents: number;
  promoterEarningsCents: number;
  peerRacingOrgCents: number;
  grossPotCents: number;
  processingFeeCents: number;
  shootoutFundCents: number;
  prHoldingCents: number;
  publishedDistances: number;
};

export type FinanceDashboardStats = {
  lifetime: FinancePeriodStats;
  ytd: FinancePeriodStats;
  recentSnapshots: Array<{
    eventName: string;
    distanceLabel: string;
    publishedAt: string;
    checksPaid: number;
    runnerPayoutCents: number;
    prizeCostCents: number;
    prizeRetailValueCents: number;
    prizeAwardCount: number;
    companyFundedCashShortfallCents: number;
    producerCents: number;
    peerRacingOrgCents: number;
    grossPotCents: number;
  }>;
};

type SnapshotRow = {
  distance_id: string;
  event_id: string;
  published_at: string;
  entry_count: number;
  gross_pot_cents: number;
  processing_fee_cents: number;
  shootout_fund_cents: number;
  pr_holding_cents: number;
  producer_cents: number;
  peer_racing_org_cents: number;
  racers_pot_cents: number;
  total_runner_payout_cents: number;
  checks_paid_count: number;
  prize_cost_cents: number;
  prize_retail_value_cents: number;
  prize_award_count: number;
  company_funded_cash_shortfall_cents: number;
};

function emptyPeriod(): FinancePeriodStats {
  return {
    checksPaid: 0,
    runnerPayoutCents: 0,
    prizeCostCents: 0,
    prizeRetailValueCents: 0,
    prizeAwardCount: 0,
    companyFundedCashShortfallCents: 0,
    promoterEarningsCents: 0,
    peerRacingOrgCents: 0,
    grossPotCents: 0,
    processingFeeCents: 0,
    shootoutFundCents: 0,
    prHoldingCents: 0,
    publishedDistances: 0,
  };
}

function addSnapshot(target: FinancePeriodStats, row: SnapshotRow) {
  target.checksPaid += row.checks_paid_count;
  target.runnerPayoutCents += Number(row.total_runner_payout_cents);
  target.prizeCostCents += Number(row.prize_cost_cents ?? 0);
  target.prizeRetailValueCents += Number(row.prize_retail_value_cents ?? 0);
  target.prizeAwardCount += Number(row.prize_award_count ?? 0);
  target.companyFundedCashShortfallCents += Number(row.company_funded_cash_shortfall_cents ?? 0);
  target.promoterEarningsCents += Number(row.producer_cents);
  target.peerRacingOrgCents += Number(row.peer_racing_org_cents);
  target.grossPotCents += Number(row.gross_pot_cents);
  target.processingFeeCents += Number(row.processing_fee_cents);
  target.shootoutFundCents += Number(row.shootout_fund_cents);
  target.prHoldingCents += Number(row.pr_holding_cents);
  target.publishedDistances += 1;
}

/** Aggregate finance metrics from published-distance snapshots (service role). */
export async function loadFinanceDashboardStats(
  service: SupabaseClient,
): Promise<FinanceDashboardStats> {
  const ytdStart = new Date(new Date().getFullYear(), 0, 1).toISOString();

  const { data: snapshots, error } = await service
    .from("distance_financial_snapshots")
    .select("*")
    .order("published_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (snapshots ?? []) as SnapshotRow[];
  const lifetime = emptyPeriod();
  const ytd = emptyPeriod();

  for (const row of rows) {
    addSnapshot(lifetime, row);
    if (row.published_at >= ytdStart) {
      addSnapshot(ytd, row);
    }
  }

  const eventIds = [...new Set(rows.slice(0, 25).map((r) => r.event_id))];
  const distanceIds = rows.slice(0, 25).map((r) => r.distance_id);

  const [{ data: events }, { data: distances }] = await Promise.all([
    eventIds.length
      ? service.from("events").select("id,name").in("id", eventIds)
      : Promise.resolve({ data: [] }),
    distanceIds.length
      ? service.from("distances").select("id,label").in("id", distanceIds)
      : Promise.resolve({ data: [] }),
  ]);

  const eventName = new Map((events ?? []).map((e) => [e.id, (e as { name?: string }).name ?? "Event"]));
  const distanceLabel = new Map(
    (distances ?? []).map((d) => [d.id, (d as { label?: string }).label ?? "Distance"]),
  );

  const recentSnapshots = rows.slice(0, 25).map((row) => ({
    eventName: eventName.get(row.event_id) ?? "Event",
    distanceLabel: distanceLabel.get(row.distance_id) ?? "Distance",
    publishedAt: row.published_at,
    checksPaid: row.checks_paid_count,
    runnerPayoutCents: Number(row.total_runner_payout_cents),
    prizeCostCents: Number(row.prize_cost_cents ?? 0),
    prizeRetailValueCents: Number(row.prize_retail_value_cents ?? 0),
    prizeAwardCount: Number(row.prize_award_count ?? 0),
    companyFundedCashShortfallCents: Number(row.company_funded_cash_shortfall_cents ?? 0),
    producerCents: Number(row.producer_cents),
    peerRacingOrgCents: Number(row.peer_racing_org_cents),
    grossPotCents: Number(row.gross_pot_cents),
  }));

  return { lifetime, ytd, recentSnapshots };
}

/** Count payout checks from result rows (main + each incentive line). */
export function countChecksFromResults(
  rows: Array<{
    payout_cents?: number | null;
    female_incentive_payout_cents?: number | null;
    military_incentive_payout_cents?: number | null;
  }>,
): number {
  let n = 0;
  for (const r of rows) {
    if (Number(r.payout_cents ?? 0) > 0) n += 1;
    if (Number(r.female_incentive_payout_cents ?? 0) > 0) n += 1;
    if (Number(r.military_incentive_payout_cents ?? 0) > 0) n += 1;
  }
  return n;
}

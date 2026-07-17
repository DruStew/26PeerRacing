/**
 * Shared results computation for the producer console (client preview) and the
 * publish API (server write). Both run this exact function on the same inputs,
 * so published divisions/payouts always equal what the producer saw on screen.
 *
 * Money comes from the payout calculator settings (lib/payout); the algorithm
 * only places runners into divisions.
 */

import {
  AlgorithmEntry,
  filterIncentiveEntries,
  runAlgorithm,
  runPreAlgorithm,
  sortEntries,
} from "@/lib/algorithm";
import type { AlgorithmRunResult, PayoutSource } from "@/lib/algorithm";
import { calculateEventPayout, defaultDistancePayoutSettings } from "@/lib/payout";
import type {
  DistancePayoutSettingsRow,
  DivisionPayoutResult,
  PayoutCalculationInput,
} from "@/lib/payout/types";

export const DIVISION_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] as const;
export const SCHEDULE_PLACES_TO_PAY = 12;
export const MIN_FINISHERS = 5;

/** One finisher heading into the algorithm. */
export interface FinisherInput {
  /** Stable display id — PR ID when known, otherwise entry id. */
  id: string;
  bib: string;
  first: string;
  last: string;
  age: number;
  sex: "Male" | "Female";
  timeS: number;
  military: boolean;
}

export interface IncentivePool {
  key: "female" | "military";
  title: string;
  variant: "female" | "military";
  criteria: "female" | "military";
  divisionCount: number;
  payoutDivisions: DivisionPayoutResult[];
}

export interface ConsoleComputation {
  finishers: number;
  payoutByDivision: Map<string, DivisionPayoutResult>;
  main: AlgorithmRunResult;
  incentives: (IncentivePool & { result: AlgorithmRunResult })[];
  preAlgorithm: { low: number; high: number };
  totalMainPaidCents: number;
  totalIncentivePaidCents: number;
  warnings: string[];
  entries: AlgorithmEntry[];
  /** Series shootout fund dollars held back by this race (banked on publish). */
  shootoutFundCents: number;
  /** Shootout holding fraction used (echo of settings). */
  shootoutFraction: number;
  /** Entry count that funded the pot (override ?? registered ?? finishers). */
  potEntryCount: number;
  /** Promoter share of PR holding (credited to wallet on publish). */
  producerCents: number;
  /** Peer Racing org share of PR holding. */
  peerRacingOrgCents: number;
  prHoldingCents: number;
  grossPotCents: number;
  processingFeeCents: number;
  racersPotCents: number;
}

export interface ComputeParams {
  rows: FinisherInput[];
  settings: DistancePayoutSettingsRow | null;
  distanceId: string;
  /** Entry fee from the distance, used when settings carry no override. */
  liveFeeCents: number;
  /** Registered entry count driving the pot (real mode); null = use finisher count. */
  registeredEntryCount: number | null;
  minPercentile: number;
  maxPercentile: number;
  /** Prize-only incentive categories still need division placement even with no cash pool. */
  prizeCategories?: { female?: boolean; military?: boolean };
}

export function fmtTime(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function computeConsoleResults(params: ComputeParams): ConsoleComputation | { error: string } {
  const { rows, settings, distanceId, liveFeeCents, registeredEntryCount, minPercentile, maxPercentile, prizeCategories } = params;

  if (rows.length === 0) {
    return { error: "No finishers with times yet." };
  }

  const d = settings ?? {
    ...defaultDistancePayoutSettings(distanceId),
    entry_fee_cents_override: null,
    entry_count_override: null,
  };

  const finishers = rows.length;
  // Fields below MIN_FINISHERS don't carry enough signal for the multi-division
  // curve — collapse to a single division (everyone in Alpha) so tiny races can
  // still compute and publish.
  const smallField = finishers < MIN_FINISHERS;
  const femaleCount = rows.filter((r) => r.sex === "Female").length;
  const militaryCount = rows.filter((r) => r.military).length;
  const feeCents = d.entry_fee_cents_override ?? liveFeeCents;
  const divisionCount = smallField ? 1 : Math.min(5, Math.max(1, d.division_count));
  const divisionLabels = [...DIVISION_NAMES.slice(0, divisionCount)];
  const femaleIncentiveDivisionCount = smallField ? 1 : (d.female_incentive_division_count ?? 1);
  const militaryIncentiveDivisionCount = smallField ? 1 : (d.military_incentive_division_count ?? 1);

  const input: PayoutCalculationInput = {
    entryCount: d.entry_count_override ?? registeredEntryCount ?? finishers,
    entryFeeCents: feeCents,
    processingFeeFraction: Number(d.processing_fee_fraction),
    shootoutFraction: Number(d.shootout_fraction ?? 0),
    prHoldingFraction: d.cash_payouts_enabled === false ? 1 : Number(d.pr_holding_fraction),
    producerFractionOfPrHolding: Number(d.producer_fraction_of_pr_holding),
    trueAddedMoneyCents: d.cash_payouts_enabled === false ? 0 : d.true_added_money_cents,
    femaleIncentiveFromRacersPotCents: d.cash_payouts_enabled === false ? 0 : (d.female_incentive_cents ?? 0),
    femaleIncentiveDivisionCount,
    // Incentive pools always pay the full schedule column; the column's holes define the payout depth.
    femaleIncentivePlacesToPay: SCHEDULE_PLACES_TO_PAY,
    femaleIncentiveDivisionLabels: [...DIVISION_NAMES.slice(0, femaleIncentiveDivisionCount)],
    femaleIncentiveScheduleMode: d.female_incentive_schedule_mode ?? "auto",
    femaleIncentiveManualBracket: d.female_incentive_manual_bracket ?? undefined,
    femaleIncentiveBracketEntryCount: femaleCount,
    militaryIncentiveFromRacersPotCents: d.cash_payouts_enabled === false ? 0 : (d.military_incentive_cents ?? 0),
    militaryIncentiveDivisionCount,
    militaryIncentivePlacesToPay: SCHEDULE_PLACES_TO_PAY,
    militaryIncentiveDivisionLabels: [...DIVISION_NAMES.slice(0, militaryIncentiveDivisionCount)],
    militaryIncentiveScheduleMode: d.military_incentive_schedule_mode ?? "auto",
    militaryIncentiveManualBracket: d.military_incentive_manual_bracket ?? undefined,
    militaryIncentiveBracketEntryCount: militaryCount,
    eliteDivisionCarveFromPoolCents: d.cash_payouts_enabled === false ? 0 : d.elite_division_carve_cents,
    divisionCount,
    eliteDivisionIndex: Math.min(divisionCount - 1, Math.max(0, d.elite_division_index)),
    scheduleMode: d.schedule_mode,
    manualBracket: d.manual_bracket ?? undefined,
    placesToPay: SCHEDULE_PLACES_TO_PAY,
    divisionLabels,
  };

  let payout;
  try {
    payout = calculateEventPayout(input);
  } catch {
    return { error: "Payout calculation failed — check the payout settings for this distance." };
  }

  const incentivePools: IncentivePool[] = [];
  if (
    ((d.cash_payouts_enabled !== false && (d.female_incentive_cents ?? 0) > 0) || prizeCategories?.female) &&
    femaleCount > 0
  ) {
    incentivePools.push({
      key: "female",
      title: "Female incentive",
      variant: "female",
      criteria: "female",
      divisionCount: femaleIncentiveDivisionCount,
      payoutDivisions: payout.femaleIncentiveDivisions,
    });
  }
  if (
    ((d.cash_payouts_enabled !== false && (d.military_incentive_cents ?? 0) > 0) || prizeCategories?.military) &&
    militaryCount > 0
  ) {
    incentivePools.push({
      key: "military",
      title: "Military incentive",
      variant: "military",
      criteria: "military",
      divisionCount: militaryIncentiveDivisionCount,
      payoutDivisions: payout.militaryIncentiveDivisions,
    });
  }

  // Adapter: the algorithm reads division counts + per-place amounts straight from
  // the producer's payout calculation — money is never defined twice.
  const toAmounts = (divs: DivisionPayoutResult[]) => {
    const rec: Record<string, number[]> = {};
    for (const dv of divs) {
      rec[dv.label] = dv.places.filter((p) => p.amountCents > 0).map((p) => p.amountCents);
    }
    return rec;
  };
  const mainAmounts = toAmounts(payout.divisions);
  const incentiveAmounts = incentivePools.map((p) => toAmounts(p.payoutDivisions));
  const source: PayoutSource = {
    numDivisions: (run = null) => (run == null ? divisionCount : incentivePools[run].divisionCount),
    payout: (run = null) => (run == null ? mainAmounts : incentiveAmounts[run]),
  };

  const entries = rows.map(
    (r) =>
      new AlgorithmEntry(r.id, r.bib, r.first, r.last, r.age, r.sex, r.timeS, -1, "", fmtTime(r.timeS), r.military),
  );
  sortEntries(entries);

  const preAlg = runPreAlgorithm(entries);

  try {
    const main = runAlgorithm(
      entries,
      { max_percentile: maxPercentile, min_percentile: minPercentile },
      source,
    );

    const incentives = incentivePools.map((pool, i) => {
      const subset = filterIncentiveEntries(entries, pool.criteria);
      const result = runAlgorithm(
        subset,
        { max_percentile: maxPercentile, min_percentile: minPercentile },
        source,
        i,
      );
      return { ...pool, result };
    });

    let totalMainPaidCents = 0;
    let totalIncentivePaidCents = 0;
    entries.forEach((e) => {
      totalMainPaidCents += e.payout;
      totalIncentivePaidCents += e.incentivePayout1 + e.incentivePayout2 + e.incentivePayout3;
    });

    return {
      finishers,
      payoutByDivision: new Map(payout.divisions.map((dv) => [dv.label, dv])),
      main,
      incentives,
      preAlgorithm: { low: preAlg.lowPercentileCutoff, high: preAlg.highPercentileCutoff },
      totalMainPaidCents,
      totalIncentivePaidCents,
      warnings: payout.warnings,
      entries,
      shootoutFundCents: payout.shootoutFundCents,
      shootoutFraction: Number(d.shootout_fraction ?? 0),
      potEntryCount: input.entryCount,
      producerCents: payout.producerCents,
      peerRacingOrgCents: payout.peerRacingOrgCents,
      prHoldingCents: payout.prHoldingCents,
      grossPotCents: payout.grossPotCents,
      processingFeeCents: payout.processingFeeCents,
      racersPotCents: payout.racersPotCents,
    };
  } catch {
    return { error: "Algorithm failed on this field — try different percentile cutoffs." };
  }
}

import type { DistancePayoutSettingsRow, PayoutBracketId, PayoutCalculationInput } from "./types";

const PEER_TEAM_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] as const;

function divisionLabelsForCount(count: number): string[] {
  const c = Math.min(5, Math.max(1, Math.floor(count)));
  return [...PEER_TEAM_NAMES.slice(0, c)];
}

export function payoutSettingsToCalculationInput(
  row: DistancePayoutSettingsRow,
  live: { entryCount: number; entryFeeCents: number; femaleEntryCount?: number; militaryEntryCount?: number },
): PayoutCalculationInput {
  const labels = row.division_labels;
  const femaleSch = row.female_incentive_schedule_mode === "manual" ? "manual" : "auto";
  const militarySch = row.military_incentive_schedule_mode === "manual" ? "manual" : "auto";
  return {
    entryCount: row.entry_count_override ?? live.entryCount,
    entryFeeCents: row.entry_fee_cents_override ?? live.entryFeeCents,
    processingFeeFraction: Number(row.processing_fee_fraction),
    shootoutFraction: Number(row.shootout_fraction ?? 0),
    prHoldingFraction: row.cash_payouts_enabled === false ? 1 : Number(row.pr_holding_fraction),
    producerFractionOfPrHolding: Number(row.producer_fraction_of_pr_holding),
    trueAddedMoneyCents: row.cash_payouts_enabled === false ? 0 : row.true_added_money_cents,
    femaleIncentiveFromRacersPotCents:
      row.cash_payouts_enabled === false ? 0 : Math.max(0, Math.round(Number(row.female_incentive_cents ?? 0))),
    militaryIncentiveFromRacersPotCents:
      row.cash_payouts_enabled === false ? 0 : Math.max(0, Math.round(Number(row.military_incentive_cents ?? 0))),
    eliteDivisionCarveFromPoolCents: row.cash_payouts_enabled === false ? 0 : row.elite_division_carve_cents,
    divisionCount: row.division_count,
    eliteDivisionIndex: row.elite_division_index,
    scheduleMode: row.schedule_mode,
    manualBracket: row.manual_bracket ?? undefined,
    placesToPay: row.places_to_pay,
    divisionLabels: Array.isArray(labels) ? labels.map(String) : undefined,
    femaleIncentiveDivisionCount: Math.min(
      5,
      Math.max(1, Math.floor(Number(row.female_incentive_division_count ?? 1))),
    ),
    // Incentive pools always pay the full schedule column (the column's holes define payout depth).
    femaleIncentivePlacesToPay: 12,
    femaleIncentiveDivisionLabels: divisionLabelsForCount(
      Number(row.female_incentive_division_count ?? 1),
    ),
    militaryIncentiveDivisionCount: Math.min(
      5,
      Math.max(1, Math.floor(Number(row.military_incentive_division_count ?? 1))),
    ),
    militaryIncentivePlacesToPay: 12,
    militaryIncentiveDivisionLabels: divisionLabelsForCount(
      Number(row.military_incentive_division_count ?? 1),
    ),
    femaleIncentiveScheduleMode: femaleSch,
    femaleIncentiveManualBracket: (row.female_incentive_manual_bracket ?? undefined) as
      | PayoutBracketId
      | undefined,
    femaleIncentiveBracketEntryCount: Math.max(0, Math.floor(live.femaleEntryCount ?? 0)),
    militaryIncentiveScheduleMode: militarySch,
    militaryIncentiveManualBracket: (row.military_incentive_manual_bracket ?? undefined) as
      | PayoutBracketId
      | undefined,
    militaryIncentiveBracketEntryCount: Math.max(0, Math.floor(live.militaryEntryCount ?? 0)),
  };
}

export function defaultDistancePayoutSettings(distanceId: string): Omit<DistancePayoutSettingsRow, "updated_at"> {
  return {
    distance_id: distanceId,
    cash_payouts_enabled: true,
    processing_fee_fraction: 0.04,
    shootout_fraction: 0,
    pr_holding_fraction: 0.5,
    producer_fraction_of_pr_holding: 0.5,
    true_added_money_cents: 0,
    female_incentive_cents: 0,
    military_incentive_cents: 0,
    female_incentive_division_count: 1,
    female_incentive_places_to_pay: 12,
    military_incentive_division_count: 1,
    military_incentive_places_to_pay: 12,
    female_incentive_schedule_mode: "auto",
    female_incentive_manual_bracket: null,
    military_incentive_schedule_mode: "auto",
    military_incentive_manual_bracket: null,
    elite_division_carve_cents: 0,
    division_count: 5,
    elite_division_index: 0,
    schedule_mode: "auto",
    manual_bracket: null,
    places_to_pay: 12,
    division_labels: null,
    entry_count_override: null,
    entry_fee_cents_override: null,
  };
}

/** @deprecated Use defaultDistancePayoutSettings */
export const defaultPayoutSettingsRow = defaultDistancePayoutSettings;

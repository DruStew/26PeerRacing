import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateEventPayout } from "@/lib/payout/calculate";
import { payoutSettingsToCalculationInput } from "@/lib/payout/settings-map";
import type { DistancePayoutSettingsRow } from "@/lib/payout/types";
import type { PrizeCategory, PrizeRule, PrizeSettings } from "@/lib/prizes/types";

export type PublicCashPlace = { place: number; amountCents: number };
export type PublicCashDivision = { label: string; places: PublicCashPlace[] };
export type PublicCashPool = { title: string; divisions: PublicCashDivision[] };

export type PublicPrizeLine = {
  category: PrizeCategory;
  division: string | null;
  place: number;
  name: string;
  retailValueCents: number;
  showRetailValue: boolean;
};

export type PublicAwardMarketing = {
  distanceId: string;
  display: "cash" | "prizes" | "both";
  cashMode: "entry_based" | "guaranteed" | null;
  cashHeadlineCents: number;
  modeledEntryCount: number | null;
  modeledEntryFeeCents: number | null;
  cashPools: PublicCashPool[];
  prizes: PublicPrizeLine[];
  prizeMaxPlace: number;
};

function publicDivisions(
  divisions: Array<{ label: string; places: Array<{ place: number; amountCents: number }> }>,
): PublicCashDivision[] {
  return divisions
    .map((division) => ({
      label: division.label,
      places: division.places
        .filter((place) => place.amountCents > 0)
        .map((place) => ({ place: place.place, amountCents: place.amountCents })),
    }))
    .filter((division) => division.places.length > 0);
}

export async function loadPublicAwardMarketing(
  service: SupabaseClient,
  distanceIds: string[],
): Promise<Map<string, PublicAwardMarketing>> {
  const ids = [...new Set(distanceIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const [{ data: distances }, { data: payoutRows }, { data: prizeSettingsRows }] = await Promise.all([
    service.from("distances").select("id,entry_fee_cents").in("id", ids),
    service.from("distance_payout_settings").select("*").in("distance_id", ids),
    service.from("distance_prize_settings").select("*").in("distance_id", ids),
  ]);

  const feeByDistance = new Map(
    ((distances ?? []) as Array<{ id: string; entry_fee_cents: number | null }>).map((distance) => [
      distance.id,
      Math.max(0, Number(distance.entry_fee_cents ?? 0)),
    ]),
  );
  const payoutByDistance = new Map(
    ((payoutRows ?? []) as DistancePayoutSettingsRow[]).map((row) => [row.distance_id, row]),
  );
  const prizeSettingsByDistance = new Map(
    ((prizeSettingsRows ?? []) as PrizeSettings[]).map((row) => [row.distance_id, row]),
  );
  const configIds = [...prizeSettingsByDistance.values()].map((settings) => settings.current_config_id);
  const { data: ruleRows } =
    configIds.length > 0
      ? await service
          .from("distance_prize_rules")
          .select("distance_id,config_id,category,division,place,sort_order,prize_name,cost_cents,retail_value_cents")
          .in("distance_id", ids)
          .in("config_id", configIds)
      : { data: [] };
  const rulesByDistance = new Map<string, PrizeRule[]>();
  for (const raw of ruleRows ?? []) {
    const row = raw as PrizeRule & { distance_id: string; config_id: string };
    const settings = prizeSettingsByDistance.get(row.distance_id);
    if (!settings || settings.current_config_id !== row.config_id) continue;
    const current = rulesByDistance.get(row.distance_id) ?? [];
    current.push(row);
    rulesByDistance.set(row.distance_id, current);
  }

  const output = new Map<string, PublicAwardMarketing>();
  for (const distanceId of ids) {
    const prizeSettings = prizeSettingsByDistance.get(distanceId);
    const rawDisplay = prizeSettings?.public_awards_display ?? "none";
    if (rawDisplay === "none") continue;

    const payoutSettings = payoutByDistance.get(distanceId);
    const showCash =
      (rawDisplay === "cash" || rawDisplay === "both") &&
      payoutSettings?.cash_payouts_enabled !== false &&
      Boolean(payoutSettings);
    const showPrizes = rawDisplay === "prizes" || rawDisplay === "both";

    let cashMode: PublicAwardMarketing["cashMode"] = null;
    let cashHeadlineCents = 0;
    let modeledEntryCount: number | null = null;
    let modeledEntryFeeCents: number | null = null;
    let cashPools: PublicCashPool[] = [];
    if (showCash && payoutSettings) {
      const input = payoutSettingsToCalculationInput(payoutSettings, {
        entryCount: payoutSettings.marketing_entry_count ?? 0,
        entryFeeCents: payoutSettings.marketing_entry_fee_cents ?? feeByDistance.get(distanceId) ?? 0,
        femaleEntryCount: payoutSettings.marketing_female_entry_count ?? 0,
        militaryEntryCount: payoutSettings.marketing_military_entry_count ?? 0,
      });
      const result = calculateEventPayout(input);
      cashMode = result.cashPayoutMode;
      modeledEntryCount = input.entryCount;
      modeledEntryFeeCents = input.entryFeeCents;
      cashHeadlineCents =
        result.cashPayoutMode === "guaranteed"
          ? result.guaranteedCashPayoutCents
          : result.totalContestantPayoutsCents + result.femaleIncentiveCents + result.militaryIncentiveCents;
      cashPools = [{ title: "Division cash", divisions: publicDivisions(result.divisions) }];
      const female = publicDivisions(result.femaleIncentiveDivisions);
      const military = publicDivisions(result.militaryIncentiveDivisions);
      if (female.length > 0) cashPools.push({ title: "Female incentive cash", divisions: female });
      if (military.length > 0) cashPools.push({ title: "Military incentive cash", divisions: military });
    }

    const enabledCategory = (category: PrizeCategory) =>
      category === "main"
        ? prizeSettings?.main_prizes_enabled
        : category === "female"
          ? prizeSettings?.female_prizes_enabled
          : prizeSettings?.military_prizes_enabled;
    const prizes = showPrizes
      ? (rulesByDistance.get(distanceId) ?? [])
          .filter((rule) => enabledCategory(rule.category))
          .sort(
            (a, b) =>
              a.category.localeCompare(b.category) ||
              (a.division ?? "").localeCompare(b.division ?? "") ||
              a.place - b.place ||
              a.sort_order - b.sort_order,
          )
          .map((rule) => ({
            category: rule.category,
            division: rule.division,
            place: rule.place,
            name: rule.prize_name,
            retailValueCents: rule.retail_value_cents,
            showRetailValue: prizeSettings?.show_individual_retail_values === true,
          }))
      : [];

    if (!showCash && prizes.length === 0) continue;
    output.set(distanceId, {
      distanceId,
      display: showCash && prizes.length > 0 ? "both" : showCash ? "cash" : "prizes",
      cashMode,
      cashHeadlineCents,
      modeledEntryCount,
      modeledEntryFeeCents,
      cashPools,
      prizes,
      prizeMaxPlace: prizes.reduce((max, prize) => Math.max(max, prize.place), 0),
    });
  }
  return output;
}

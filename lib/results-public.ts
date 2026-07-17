import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Public, official race results for a single distance — built entirely from the
 * results rows the producer published (never recomputed). Shows the world the
 * standings, divisions, badges, and money paid; it deliberately omits producer-only
 * internals (processing/PR/shootout holdings, percentile cutoffs, import controls).
 */

export type PublicFinisher = {
  id: string;
  bib: string | null;
  firstName: string;
  lastName: string;
  finishTimeMs: number | null;
  overallRank: number | null;
  division: string | null;
  divisionPlace: number | null;
  payoutCents: number;
  femaleIncentiveDivision: string | null;
  femaleIncentivePlace: number | null;
  femaleIncentivePayoutCents: number;
  militaryIncentiveDivision: string | null;
  militaryIncentivePlace: number | null;
  militaryIncentivePayoutCents: number;
  prizes: PublicPrizeAward[];
};

export type PublicPrizeAward = {
  id: string;
  category: "main" | "female" | "military";
  division: string;
  place: number;
  name: string;
  retailValueCents: number;
  showRetailValue: boolean;
};

export type PublicDivision = {
  division: string;
  runners: PublicFinisher[];
  paidCents: number;
  minHours: number;
  maxHours: number;
};

export type PublicIncentivePool = {
  key: "female" | "military";
  title: string;
  divisions: { division: string; runners: PublicFinisher[] }[];
};

export type PublicResults = {
  eventId: string;
  distanceId: string;
  eventName: string;
  raceDate: string | null;
  city: string | null;
  state: string | null;
  distanceLabel: string;
  publishedAt: string | null;
  finishers: PublicFinisher[];
  divisions: PublicDivision[];
  incentives: PublicIncentivePool[];
  totalFinishers: number;
  totalPayoutCents: number;
  checksPaid: number;
  prizeAwardCount: number;
  totalPrizeRetailValueCents: number;
  showTotalAwardValue: boolean;
  minHours: number;
  maxHours: number;
};

type ResultRow = {
  id: string;
  bib: string | null;
  first_name: string | null;
  last_name: string | null;
  finish_time_ms: number | null;
  overall_rank: number | null;
  division: string | null;
  division_place: number | null;
  payout_cents: number | null;
  female_incentive_division: string | null;
  female_incentive_place: number | null;
  female_incentive_payout_cents: number | null;
  military_incentive_division: string | null;
  military_incentive_place: number | null;
  military_incentive_payout_cents: number | null;
};

const RESULT_COLUMNS =
  "id,bib,first_name,last_name,finish_time_ms,overall_rank,division,division_place,payout_cents," +
  "female_incentive_division,female_incentive_place,female_incentive_payout_cents," +
  "military_incentive_division,military_incentive_place,military_incentive_payout_cents";

function toFinisher(row: ResultRow): PublicFinisher {
  return {
    id: row.id,
    bib: row.bib,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    finishTimeMs: row.finish_time_ms,
    overallRank: row.overall_rank,
    division: row.division,
    divisionPlace: row.division_place,
    payoutCents: row.payout_cents ?? 0,
    femaleIncentiveDivision: row.female_incentive_division,
    femaleIncentivePlace: row.female_incentive_place,
    femaleIncentivePayoutCents: row.female_incentive_payout_cents ?? 0,
    militaryIncentiveDivision: row.military_incentive_division,
    militaryIncentivePlace: row.military_incentive_place,
    militaryIncentivePayoutCents: row.military_incentive_payout_cents ?? 0,
    prizes: [],
  };
}

const hours = (ms: number | null): number => (ms == null ? 0 : ms / 3_600_000);

/**
 * Load published results for one distance, or null if the distance is missing,
 * belongs to a different event, or has not been published yet.
 */
export async function loadPublicResults(
  supabase: SupabaseClient,
  eventId: string,
  distanceId: string,
): Promise<PublicResults | null> {
  const { data: distance } = await supabase
    .from("distances")
    .select("id,event_id,label,results_published_at")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();

  const dist = distance as
    | { id: string; event_id: string; label: string | null; results_published_at: string | null }
    | null;
  if (!dist || !dist.results_published_at) return null;

  const { data: eventData } = await supabase
    .from("events")
    .select("id,name,race_date,city,state")
    .eq("id", eventId)
    .maybeSingle();
  const event = eventData as
    | { id: string; name: string | null; race_date: string | null; city: string | null; state: string | null }
    | null;
  if (!event) return null;

  const { data } = await supabase
    .from("results")
    .select(RESULT_COLUMNS)
    .eq("event_id", eventId)
    .eq("distance_id", distanceId)
    .eq("published", true)
    .order("overall_rank", { ascending: true });

  const rows = (data ?? []) as unknown as ResultRow[];
  if (rows.length === 0) return null;

  const finishers = rows.map(toFinisher);
  const resultIds = finishers.map((finisher) => finisher.id);
  const { data: prizeData } =
    resultIds.length > 0
      ? await supabase
          .from("published_prize_awards")
          .select("id,result_id,category,division,place,award_order,prize_name,retail_value_cents,show_retail_value,show_total_award_value")
          .in("result_id", resultIds)
          .order("category")
          .order("place")
          .order("award_order")
      : { data: [] };
  const prizeRows = (prizeData ?? []) as Array<{
    id: string;
    result_id: string;
    category: "main" | "female" | "military";
    division: string;
    place: number;
    prize_name: string;
    retail_value_cents: number;
    show_retail_value: boolean;
    show_total_award_value: boolean;
  }>;
  const finisherById = new Map(finishers.map((finisher) => [finisher.id, finisher]));
  for (const prize of prizeRows) {
    finisherById.get(prize.result_id)?.prizes.push({
      id: prize.id,
      category: prize.category,
      division: prize.division,
      place: prize.place,
      name: prize.prize_name,
      retailValueCents: prize.retail_value_cents,
      showRetailValue: prize.show_retail_value,
    });
  }

  // Main divisions, ordered by the fastest band first.
  const byDivision = new Map<string, PublicFinisher[]>();
  for (const f of finishers) {
    if (!f.division) continue;
    const arr = byDivision.get(f.division) ?? [];
    arr.push(f);
    byDivision.set(f.division, arr);
  }
  const divisions: PublicDivision[] = [...byDivision.entries()]
    .map(([division, runners]) => {
      const sorted = [...runners].sort(
        (a, b) => (a.divisionPlace ?? 9999) - (b.divisionPlace ?? 9999) || (a.overallRank ?? 0) - (b.overallRank ?? 0),
      );
      const times = sorted.map((r) => hours(r.finishTimeMs)).filter((h) => h > 0);
      return {
        division,
        runners: sorted,
        paidCents: sorted.reduce((s, r) => s + r.payoutCents, 0),
        minHours: times.length ? Math.min(...times) : 0,
        maxHours: times.length ? Math.max(...times) : 0,
      };
    })
    .sort((a, b) => a.minHours - b.minHours);

  // Incentive pools, only included when at least one racer placed in them.
  const buildPool = (key: "female" | "military", title: string): PublicIncentivePool | null => {
    const divisionOf = (f: PublicFinisher) =>
      key === "female" ? f.femaleIncentiveDivision : f.militaryIncentiveDivision;
    const placeOf = (f: PublicFinisher) =>
      key === "female" ? f.femaleIncentivePlace : f.militaryIncentivePlace;
    const map = new Map<string, PublicFinisher[]>();
    for (const f of finishers) {
      const div = divisionOf(f);
      if (!div) continue;
      const arr = map.get(div) ?? [];
      arr.push(f);
      map.set(div, arr);
    }
    if (map.size === 0) return null;
    return {
      key,
      title,
      divisions: [...map.entries()].map(([division, runners]) => ({
        division,
        runners: [...runners].sort((a, b) => (placeOf(a) ?? 9999) - (placeOf(b) ?? 9999)),
      })),
    };
  };
  const incentives = [
    buildPool("female", "Female Incentive"),
    buildPool("military", "Military Incentive"),
  ].filter((p): p is PublicIncentivePool => p != null);

  const totalPayoutCents = finishers.reduce(
    (s, f) => s + f.payoutCents + f.femaleIncentivePayoutCents + f.militaryIncentivePayoutCents,
    0,
  );
  const checksPaid = finishers.reduce(
    (s, f) =>
      s +
      (f.payoutCents > 0 ? 1 : 0) +
      (f.femaleIncentivePayoutCents > 0 ? 1 : 0) +
      (f.militaryIncentivePayoutCents > 0 ? 1 : 0),
    0,
  );

  const allTimes = finishers.map((f) => hours(f.finishTimeMs)).filter((h) => h > 0);
  const minHours = allTimes.length ? Math.min(...allTimes) : 0;
  const maxHours = allTimes.length ? Math.max(...allTimes) : 1;

  return {
    eventId,
    distanceId,
    eventName: event.name ?? "Race",
    raceDate: event.race_date,
    city: event.city,
    state: event.state,
    distanceLabel: dist.label ?? "Race",
    publishedAt: dist.results_published_at,
    finishers,
    divisions,
    incentives,
    totalFinishers: finishers.length,
    totalPayoutCents,
    checksPaid,
    prizeAwardCount: prizeRows.length,
    totalPrizeRetailValueCents: prizeRows.reduce((sum, prize) => sum + prize.retail_value_cents, 0),
    showTotalAwardValue: prizeRows.some((prize) => prize.show_total_award_value),
    minHours,
    maxHours,
  };
}

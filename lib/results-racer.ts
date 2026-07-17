import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Racer-facing results + trophy case loaders. Always scope every query by the
 * authenticated user's id — these run with the service role so the caller MUST
 * pass the verified auth user id (never a value from the request body).
 */

export type RacerResult = {
  id: string;
  eventId: string;
  distanceId: string;
  eventName: string;
  raceDate: string | null;
  city: string | null;
  state: string | null;
  distanceLabel: string;
  bib: string | null;
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
  publishedAt: string | null;
  prizes: RacerPrizeAward[];
};

export type RacerPrizeAward = {
  id: string;
  category: "main" | "female" | "military";
  name: string;
  retailValueCents: number;
  showRetailValue: boolean;
};

export type RacerBadge = {
  id: string;
  eventId: string;
  distanceId: string;
  resultId: string | null;
  badgeKey: string;
  badgeTitle: string;
  division: string | null;
  divisionPlace: number | null;
  payoutCents: number;
};

type ResultRow = {
  id: string;
  event_id: string;
  distance_id: string;
  bib: string | null;
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
  published_at: string | null;
};

type EventMeta = { name: string; race_date: string | null; city: string | null; state: string | null };

function toRacerResult(
  row: ResultRow,
  ev: EventMeta | undefined,
  distanceLabel: string,
): RacerResult {
  return {
    id: row.id,
    eventId: row.event_id,
    distanceId: row.distance_id,
    eventName: ev?.name ?? "Race",
    raceDate: ev?.race_date ?? null,
    city: ev?.city ?? null,
    state: ev?.state ?? null,
    distanceLabel,
    bib: row.bib,
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
    publishedAt: row.published_at,
    prizes: [],
  };
}

const RESULT_COLUMNS =
  "id,event_id,distance_id,bib,finish_time_ms,overall_rank,division,division_place,payout_cents," +
  "female_incentive_division,female_incentive_place,female_incentive_payout_cents," +
  "military_incentive_division,military_incentive_place,military_incentive_payout_cents,published_at";

async function decorateWithMeta(
  service: SupabaseClient,
  rows: ResultRow[],
): Promise<RacerResult[]> {
  if (rows.length === 0) return [];
  const eventIds = [...new Set(rows.map((r) => r.event_id))];
  const distanceIds = [...new Set(rows.map((r) => r.distance_id))];

  const resultIds = rows.map((row) => row.id);
  const [eventsRes, distancesRes, prizesRes] = await Promise.all([
    service.from("events").select("id,name,race_date,city,state").in("id", eventIds),
    service.from("distances").select("id,label").in("id", distanceIds),
    service
      .from("published_prize_awards")
      .select("id,result_id,category,prize_name,retail_value_cents,show_retail_value,award_order")
      .in("result_id", resultIds)
      .order("award_order"),
  ]);

  const eventById = new Map(
    ((eventsRes.data ?? []) as Array<{ id: string } & EventMeta>).map((e) => [e.id, e]),
  );
  const distLabelById = new Map(
    ((distancesRes.data ?? []) as Array<{ id: string; label: string | null }>).map((d) => [
      d.id,
      d.label ?? "Race",
    ]),
  );

  const decorated = rows.map((r) =>
    toRacerResult(r, eventById.get(r.event_id), distLabelById.get(r.distance_id) ?? "Race"),
  );
  const resultById = new Map(decorated.map((result) => [result.id, result]));
  for (const prize of (prizesRes.data ?? []) as Array<{
    id: string;
    result_id: string;
    category: "main" | "female" | "military";
    prize_name: string;
    retail_value_cents: number;
    show_retail_value: boolean;
  }>) {
    resultById.get(prize.result_id)?.prizes.push({
      id: prize.id,
      category: prize.category,
      name: prize.prize_name,
      retailValueCents: prize.retail_value_cents,
      showRetailValue: prize.show_retail_value,
    });
  }
  return decorated;
}

/** All of a racer's published results, newest race first. */
export async function loadRacerResults(
  service: SupabaseClient,
  userId: string,
): Promise<RacerResult[]> {
  const { data } = await service
    .from("results")
    .select(RESULT_COLUMNS)
    .eq("user_id", userId)
    .eq("published", true);

  const results = await decorateWithMeta(service, (data ?? []) as unknown as ResultRow[]);
  return results.sort((a, b) => (b.raceDate ?? "").localeCompare(a.raceDate ?? ""));
}

/** One published result owned by the racer, plus overall + division field sizes for context. */
export async function loadRacerResult(
  service: SupabaseClient,
  userId: string,
  resultId: string,
): Promise<{ result: RacerResult; overallFinishers: number; divisionFinishers: number } | null> {
  const { data } = await service
    .from("results")
    .select(RESULT_COLUMNS)
    .eq("id", resultId)
    .eq("user_id", userId)
    .eq("published", true)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as ResultRow;
  const [decorated] = await decorateWithMeta(service, [row]);

  const { count: overallFinishers } = await service
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("distance_id", row.distance_id)
    .eq("published", true);

  let divisionFinishers = 0;
  if (row.division) {
    const { count } = await service
      .from("results")
      .select("id", { count: "exact", head: true })
      .eq("distance_id", row.distance_id)
      .eq("division", row.division)
      .eq("published", true);
    divisionFinishers = count ?? 0;
  }

  return {
    result: decorated,
    overallFinishers: overallFinishers ?? 0,
    divisionFinishers,
  };
}

/** All badges a racer has earned across events (trophy case). */
export async function loadRacerBadges(
  service: SupabaseClient,
  userId: string,
): Promise<RacerBadge[]> {
  const { data } = await service
    .from("badges")
    .select("id,event_id,distance_id,result_id,badge_key,badge_title,division,division_place,payout_cents")
    .eq("user_id", userId);

  return ((data ?? []) as Array<{
    id: string;
    event_id: string;
    distance_id: string;
    result_id: string | null;
    badge_key: string;
    badge_title: string | null;
    division: string | null;
    division_place: number | null;
    payout_cents: number | null;
  }>).map((b) => ({
    id: b.id,
    eventId: b.event_id,
    distanceId: b.distance_id,
    resultId: b.result_id,
    badgeKey: b.badge_key,
    badgeTitle: b.badge_title ?? "Badge",
    division: b.division,
    divisionPlace: b.division_place,
    payoutCents: b.payout_cents ?? 0,
  }));
}

/** H:MM:SS (or M:SS under an hour) from milliseconds. */
export function formatFinishTime(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 1 -> "1st", 2 -> "2nd"… */
export function ordinal(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

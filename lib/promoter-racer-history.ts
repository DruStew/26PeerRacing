import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Promoter-scoped racer history loader. Returns a racer's results across one
 * promoter's events ONLY — never full profile data or other promoters' races.
 * Callers must verify the requester owns/administers the event first.
 */

export type PromoterRacerHistoryResult = {
  id: string;
  eventId: string;
  eventName: string;
  raceDate: string | null;
  city: string | null;
  state: string | null;
  distanceLabel: string;
  finishTimeMs: number | null;
  overallRank: number | null;
  division: string | null;
  divisionPlace: number | null;
  payoutCents: number;
  published: boolean;
};

export type PromoterRacerHistory = {
  racer: { id: string; name: string; prId: string | null } | null;
  results: PromoterRacerHistoryResult[];
};

export async function loadPromoterScopedRacerHistory(
  service: SupabaseClient,
  promoterId: string,
  userId: string,
): Promise<PromoterRacerHistory> {
  const { data: ownEvents } = await service
    .from("events")
    .select("id,name,race_date,city,state")
    .eq("promoter_id", promoterId);
  const eventMeta = new Map(
    ((ownEvents ?? []) as Array<{
      id: string;
      name: string;
      race_date: string | null;
      city: string | null;
      state: string | null;
    }>).map((e) => [e.id, e]),
  );
  const scopedEventIds = [...eventMeta.keys()];
  if (scopedEventIds.length === 0) return { racer: null, results: [] };

  const { data: profile } = await service
    .from("profiles")
    .select("id,first_name,last_name,pr_id")
    .eq("id", userId)
    .maybeSingle();

  const { data: resultRows } = await service
    .from("results")
    .select(
      "id,event_id,distance_id,finish_time_ms,overall_rank,division,division_place,payout_cents," +
        "female_incentive_payout_cents,military_incentive_payout_cents,published",
    )
    .eq("user_id", userId)
    .in("event_id", scopedEventIds);

  const rows = (resultRows ?? []) as unknown as Array<{
    id: string;
    event_id: string;
    distance_id: string;
    finish_time_ms: number | null;
    overall_rank: number | null;
    division: string | null;
    division_place: number | null;
    payout_cents: number | null;
    female_incentive_payout_cents: number | null;
    military_incentive_payout_cents: number | null;
    published: boolean;
  }>;

  const distanceIds = [...new Set(rows.map((r) => r.distance_id))];
  const { data: distances } =
    distanceIds.length > 0
      ? await service.from("distances").select("id,label").in("id", distanceIds)
      : { data: [] };
  const distLabel = new Map(
    ((distances ?? []) as Array<{ id: string; label: string | null }>).map((d) => [d.id, d.label ?? "Race"]),
  );

  const results = rows
    .map((r) => {
      const ev = eventMeta.get(r.event_id);
      return {
        id: r.id,
        eventId: r.event_id,
        eventName: ev?.name ?? "Race",
        raceDate: ev?.race_date ?? null,
        city: ev?.city ?? null,
        state: ev?.state ?? null,
        distanceLabel: distLabel.get(r.distance_id) ?? "Race",
        finishTimeMs: r.finish_time_ms,
        overallRank: r.overall_rank,
        division: r.division,
        divisionPlace: r.division_place,
        payoutCents:
          (r.payout_cents ?? 0) +
          (r.female_incentive_payout_cents ?? 0) +
          (r.military_incentive_payout_cents ?? 0),
        published: r.published,
      };
    })
    .sort((a, b) => (b.raceDate ?? "").localeCompare(a.raceDate ?? ""));

  const racer = profile
    ? {
        id: (profile as { id: string }).id,
        name:
          `${(profile as { first_name?: string }).first_name ?? ""} ${
            (profile as { last_name?: string }).last_name ?? ""
          }`.trim() || "Racer",
        prId: (profile as { pr_id?: string | null }).pr_id?.trim() || null,
      }
    : null;

  return { racer, results };
}

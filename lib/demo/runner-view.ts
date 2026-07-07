import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeConsoleResults, MIN_FINISHERS } from "@/lib/results-console/compute";
import { loadFinishersForDistance, type FinisherRow } from "@/lib/results-console/finishers";
import type { DistancePayoutSettingsRow } from "@/lib/payout/types";

/**
 * Demo "runner view": what a racer's My Results page would show after this demo
 * race, computed live from imported finish times + payout settings — exactly
 * the same math the publish API runs, but nothing is written anywhere.
 */

export type DemoRunnerRaceResult = {
  distanceId: string;
  distanceLabel: string;
  finishTimeMs: number | null;
  overallRank: number | null;
  overallFinishers: number;
  division: string | null;
  divisionPlace: number | null;
  payoutCents: number;
  femaleIncentiveDivision: string | null;
  femaleIncentivePlace: number | null;
  femaleIncentivePayoutCents: number;
  militaryIncentiveDivision: string | null;
  militaryIncentivePlace: number | null;
  militaryIncentivePayoutCents: number;
  /** Why divisions could not be computed for this distance (too few finishers, etc.). */
  note: string | null;
};

export type DemoRunnerBadge = {
  key: string;
  title: string;
  variant: "main" | "female" | "military";
  division: string;
  place: number | null;
  payoutCents: number;
  distanceLabel: string;
};

export type DemoRunnerView = {
  name: string;
  bib: string | null;
  sex: string | null;
  military: boolean;
  results: DemoRunnerRaceResult[];
  badges: DemoRunnerBadge[];
  totalWonCents: number;
};

type EntryRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  distance_id: string;
  bib: string | null;
  assigned_bib: string | null;
  sex: string | null;
  active_or_retired_military: boolean | null;
};

const PREVIEW_MIN_PERCENTILE = 5;
const PREVIEW_MAX_PERCENTILE = 95;

export async function loadDemoRunnerView(
  service: SupabaseClient,
  eventId: string,
  seedEntryId: string,
): Promise<DemoRunnerView | null> {
  const { data: seedRaw } = await service
    .from("entries")
    .select("id,email,first_name,last_name,distance_id,bib,assigned_bib,sex,active_or_retired_military")
    .eq("id", seedEntryId)
    .eq("event_id", eventId)
    .maybeSingle();
  const seed = seedRaw as EntryRow | null;
  if (!seed) return null;

  // All of this person's entries in the event (demo runners group by email).
  const emailNorm = seed.email?.trim().toLowerCase() ?? "";
  const { data: allRaw } = await service
    .from("entries")
    .select("id,email,first_name,last_name,distance_id,bib,assigned_bib,sex,active_or_retired_military")
    .eq("event_id", eventId);
  const personEntries = ((allRaw ?? []) as EntryRow[]).filter(
    (e) => e.id === seed.id || (emailNorm && e.email?.trim().toLowerCase() === emailNorm),
  );
  const personEntryIds = new Set(personEntries.map((e) => e.id));

  const distanceIds = [...new Set(personEntries.map((e) => e.distance_id))];
  const { data: distRaw } = await service
    .from("distances")
    .select("id,label,entry_fee_cents")
    .in("id", distanceIds);
  const distById = new Map(
    ((distRaw ?? []) as Array<{ id: string; label: string | null; entry_fee_cents: number | null }>).map(
      (d) => [d.id, d],
    ),
  );

  const results: DemoRunnerRaceResult[] = [];
  const badges: DemoRunnerBadge[] = [];

  for (const distanceId of distanceIds) {
    const distanceLabel = distById.get(distanceId)?.label ?? "Race";
    const { finishers } = await loadFinishersForDistance(service, eventId, distanceId);
    const mine = finishers.find((f: FinisherRow) => personEntryIds.has(f.entryId));

    const base: DemoRunnerRaceResult = {
      distanceId,
      distanceLabel,
      finishTimeMs: mine?.timeMs ?? null,
      overallRank: null,
      overallFinishers: finishers.length,
      division: null,
      divisionPlace: null,
      payoutCents: 0,
      femaleIncentiveDivision: null,
      femaleIncentivePlace: null,
      femaleIncentivePayoutCents: 0,
      militaryIncentiveDivision: null,
      militaryIncentivePlace: null,
      militaryIncentivePayoutCents: 0,
      note: null,
    };

    if (!mine) {
      base.note = "No finish time imported for this race yet.";
      results.push(base);
      continue;
    }
    if (finishers.length < MIN_FINISHERS) {
      base.note = `Divisions need at least ${MIN_FINISHERS} finishers (this race has ${finishers.length}).`;
      results.push(base);
      continue;
    }

    const [{ data: settings }, { count: registeredEntryCount }] = await Promise.all([
      service.from("distance_payout_settings").select("*").eq("distance_id", distanceId).maybeSingle(),
      service
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("distance_id", distanceId),
    ]);

    const comp = computeConsoleResults({
      rows: finishers,
      settings: (settings as DistancePayoutSettingsRow | null) ?? null,
      distanceId,
      liveFeeCents: Math.max(0, distById.get(distanceId)?.entry_fee_cents ?? 0),
      registeredEntryCount: registeredEntryCount ?? null,
      minPercentile: PREVIEW_MIN_PERCENTILE,
      maxPercentile: PREVIEW_MAX_PERCENTILE,
    });
    if ("error" in comp) {
      base.note = comp.error;
      results.push(base);
      continue;
    }

    // Same mapping as the publish API: algorithm entry id is prId ?? entryId.
    const myAlgo = comp.entries.find((e) => e.id === mine.id);
    if (!myAlgo) {
      base.note = "This runner was outside the computed field.";
      results.push(base);
      continue;
    }

    base.overallRank = myAlgo.overallRank;
    for (const [div, runners] of comp.main.winners) {
      const idx = runners.findIndex((e) => e.id === myAlgo.id);
      if (idx >= 0) {
        base.division = div;
        base.divisionPlace = idx + 1;
      }
    }
    base.payoutCents = Math.round(myAlgo.payout);

    comp.incentives.forEach((pool, i) => {
      for (const [div, runners] of pool.result.winners) {
        const idx = runners.findIndex((e) => e.id === myAlgo.id);
        if (idx < 0) continue;
        const payout = Math.round(myAlgo.getIncentivePayout(i));
        if (pool.key === "female") {
          base.femaleIncentiveDivision = div;
          base.femaleIncentivePlace = idx + 1;
          base.femaleIncentivePayoutCents = payout;
        } else {
          base.militaryIncentiveDivision = div;
          base.militaryIncentivePlace = idx + 1;
          base.militaryIncentivePayoutCents = payout;
        }
      }
    });

    if (base.division) {
      badges.push({
        key: `division_${base.division.toLowerCase()}`,
        title: `${base.division} Division`,
        variant: "main",
        division: base.division,
        place: base.divisionPlace,
        payoutCents: base.payoutCents,
        distanceLabel,
      });
    }
    if (base.femaleIncentiveDivision && base.femaleIncentivePayoutCents > 0) {
      badges.push({
        key: "female_incentive",
        title: "Female Incentive",
        variant: "female",
        division: base.femaleIncentiveDivision,
        place: base.femaleIncentivePlace,
        payoutCents: base.femaleIncentivePayoutCents,
        distanceLabel,
      });
    }
    if (base.militaryIncentiveDivision && base.militaryIncentivePayoutCents > 0) {
      badges.push({
        key: "military_incentive",
        title: "Military Incentive",
        variant: "military",
        division: base.militaryIncentiveDivision,
        place: base.militaryIncentivePlace,
        payoutCents: base.militaryIncentivePayoutCents,
        distanceLabel,
      });
    }

    results.push(base);
  }

  const totalWonCents = results.reduce(
    (sum, r) => sum + r.payoutCents + r.femaleIncentivePayoutCents + r.militaryIncentivePayoutCents,
    0,
  );

  return {
    name: `${seed.first_name ?? ""} ${seed.last_name ?? ""}`.trim() || "(no name)",
    bib: seed.assigned_bib?.trim() || seed.bib?.trim() || null,
    sex: seed.sex,
    military: personEntries.some((e) => e.active_or_retired_military === true),
    results,
    badges,
    totalWonCents,
  };
}

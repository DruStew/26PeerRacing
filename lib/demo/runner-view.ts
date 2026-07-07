import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeConsoleResults, MIN_FINISHERS } from "@/lib/results-console/compute";
import { loadFinishersForDistance } from "@/lib/results-console/finishers";
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

/** One row in the pick-a-runner index: person + per-race outcomes + money. */
export type DemoRunnerIndexRow = {
  entryId: string;
  name: string;
  bib: string | null;
  races: Array<{
    distanceLabel: string;
    finishTimeMs: number | null;
    division: string | null;
    divisionPlace: number | null;
    femaleIncentivePlace: number | null;
    militaryIncentivePlace: number | null;
  }>;
  totalWonCents: number;
  placed: boolean;
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

type DistanceOutcome = Omit<DemoRunnerRaceResult, "distanceId" | "distanceLabel">;

const PREVIEW_MIN_PERCENTILE = 5;
const PREVIEW_MAX_PERCENTILE = 95;

const ENTRY_COLUMNS =
  "id,email,first_name,last_name,distance_id,bib,assigned_bib,sex,active_or_retired_military";

function personKey(e: Pick<EntryRow, "id" | "email">): string {
  return e.email?.trim().toLowerCase() || e.id;
}

function emptyOutcome(overallFinishers: number, note: string | null): DistanceOutcome {
  return {
    finishTimeMs: null,
    overallRank: null,
    overallFinishers,
    division: null,
    divisionPlace: null,
    payoutCents: 0,
    femaleIncentiveDivision: null,
    femaleIncentivePlace: null,
    femaleIncentivePayoutCents: 0,
    militaryIncentiveDivision: null,
    militaryIncentivePlace: null,
    militaryIncentivePayoutCents: 0,
    note,
  };
}

/**
 * Computes outcomes for every finisher of one distance (publish math, no writes).
 * Returns per-entry outcomes plus a distance-level note when divisions can't run.
 */
async function computeDistanceOutcomes(
  service: SupabaseClient,
  eventId: string,
  distanceId: string,
  liveFeeCents: number,
): Promise<{ byEntryId: Map<string, DistanceOutcome>; finisherCount: number; note: string | null }> {
  const { finishers } = await loadFinishersForDistance(service, eventId, distanceId);
  const byEntryId = new Map<string, DistanceOutcome>();

  if (finishers.length < MIN_FINISHERS) {
    const note =
      finishers.length === 0
        ? "No finish times imported for this race yet."
        : `Divisions need at least ${MIN_FINISHERS} finishers (this race has ${finishers.length}).`;
    for (const f of finishers) {
      byEntryId.set(f.entryId, { ...emptyOutcome(finishers.length, note), finishTimeMs: f.timeMs });
    }
    return { byEntryId, finisherCount: finishers.length, note };
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
    liveFeeCents,
    registeredEntryCount: registeredEntryCount ?? null,
    minPercentile: PREVIEW_MIN_PERCENTILE,
    maxPercentile: PREVIEW_MAX_PERCENTILE,
  });
  if ("error" in comp) {
    for (const f of finishers) {
      byEntryId.set(f.entryId, { ...emptyOutcome(finishers.length, comp.error), finishTimeMs: f.timeMs });
    }
    return { byEntryId, finisherCount: finishers.length, note: comp.error };
  }

  // Same mapping as the publish API: algorithm entry id is prId ?? entryId.
  const finisherByAlgoId = new Map(finishers.map((f) => [f.id, f]));

  const mainPlacing = new Map<string, { division: string; place: number }>();
  for (const [div, runners] of comp.main.winners) {
    runners.forEach((e, idx) => mainPlacing.set(e.id, { division: div, place: idx + 1 }));
  }
  const incentivePlacing = comp.incentives.map((pool) => {
    const m = new Map<string, { division: string; place: number }>();
    for (const [div, runners] of pool.result.winners) {
      runners.forEach((e, idx) => m.set(e.id, { division: div, place: idx + 1 }));
    }
    return m;
  });

  for (const e of comp.entries) {
    const f = finisherByAlgoId.get(e.id);
    if (!f) continue;
    const placing = mainPlacing.get(e.id);
    const outcome: DistanceOutcome = {
      ...emptyOutcome(finishers.length, null),
      finishTimeMs: f.timeMs,
      overallRank: e.overallRank,
      division: placing?.division ?? null,
      divisionPlace: placing?.place ?? null,
      payoutCents: Math.round(e.payout),
    };
    comp.incentives.forEach((pool, i) => {
      const ip = incentivePlacing[i].get(e.id);
      if (!ip) return;
      const payout = Math.round(e.getIncentivePayout(i));
      if (pool.key === "female") {
        outcome.femaleIncentiveDivision = ip.division;
        outcome.femaleIncentivePlace = ip.place;
        outcome.femaleIncentivePayoutCents = payout;
      } else {
        outcome.militaryIncentiveDivision = ip.division;
        outcome.militaryIncentivePlace = ip.place;
        outcome.militaryIncentivePayoutCents = payout;
      }
    });
    byEntryId.set(f.entryId, outcome);
  }

  return { byEntryId, finisherCount: finishers.length, note: null };
}

async function loadEventDistances(
  service: SupabaseClient,
  eventId: string,
): Promise<Map<string, { label: string; entry_fee_cents: number }>> {
  const { data } = await service
    .from("distances")
    .select("id,label,entry_fee_cents")
    .eq("event_id", eventId);
  return new Map(
    ((data ?? []) as Array<{ id: string; label: string | null; entry_fee_cents: number | null }>).map(
      (d) => [d.id, { label: d.label ?? "Race", entry_fee_cents: Math.max(0, d.entry_fee_cents ?? 0) }],
    ),
  );
}

/**
 * Index of every demo runner with their computed placement + money, so the
 * picker can be sorted like a results list (winners first).
 */
export async function loadDemoRunnerIndex(
  service: SupabaseClient,
  eventId: string,
): Promise<DemoRunnerIndexRow[]> {
  const { data: entriesRaw } = await service
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("event_id", eventId);
  const entries = (entriesRaw ?? []) as EntryRow[];
  if (entries.length === 0) return [];

  const distById = await loadEventDistances(service, eventId);
  const distanceIds = [...new Set(entries.map((e) => e.distance_id))].filter((d) => distById.has(d));

  const outcomesByDistance = new Map<string, Map<string, DistanceOutcome>>();
  for (const distanceId of distanceIds) {
    const { byEntryId } = await computeDistanceOutcomes(
      service,
      eventId,
      distanceId,
      distById.get(distanceId)!.entry_fee_cents,
    );
    outcomesByDistance.set(distanceId, byEntryId);
  }

  const byPerson = new Map<string, EntryRow[]>();
  for (const e of entries) {
    const key = personKey(e);
    const list = byPerson.get(key) ?? [];
    list.push(e);
    byPerson.set(key, list);
  }

  const rows: DemoRunnerIndexRow[] = [];
  for (const list of byPerson.values()) {
    const seed = list[0]!;
    let totalWonCents = 0;
    let placed = false;
    const races: DemoRunnerIndexRow["races"] = [];
    for (const e of list) {
      const outcome = outcomesByDistance.get(e.distance_id)?.get(e.id);
      const label = distById.get(e.distance_id)?.label ?? "Race";
      if (!outcome) {
        races.push({
          distanceLabel: label,
          finishTimeMs: null,
          division: null,
          divisionPlace: null,
          femaleIncentivePlace: null,
          militaryIncentivePlace: null,
        });
        continue;
      }
      totalWonCents +=
        outcome.payoutCents + outcome.femaleIncentivePayoutCents + outcome.militaryIncentivePayoutCents;
      if (outcome.divisionPlace || outcome.femaleIncentivePlace || outcome.militaryIncentivePlace) {
        placed = true;
      }
      races.push({
        distanceLabel: label,
        finishTimeMs: outcome.finishTimeMs,
        division: outcome.division,
        divisionPlace: outcome.divisionPlace,
        femaleIncentivePlace: outcome.femaleIncentivePlace,
        militaryIncentivePlace: outcome.militaryIncentivePlace,
      });
    }
    rows.push({
      entryId: seed.id,
      name: `${seed.first_name ?? ""} ${seed.last_name ?? ""}`.trim() || "(no name)",
      bib: seed.assigned_bib?.trim() || seed.bib?.trim() || null,
      races,
      totalWonCents,
      placed,
    });
  }

  // Winners first: money desc, then placed, then fastest time, then name.
  rows.sort((a, b) => {
    if (b.totalWonCents !== a.totalWonCents) return b.totalWonCents - a.totalWonCents;
    if (a.placed !== b.placed) return a.placed ? -1 : 1;
    const at = Math.min(...a.races.map((r) => r.finishTimeMs ?? Infinity));
    const bt = Math.min(...b.races.map((r) => r.finishTimeMs ?? Infinity));
    if (at !== bt) return at - bt;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

export async function loadDemoRunnerView(
  service: SupabaseClient,
  eventId: string,
  seedEntryId: string,
): Promise<DemoRunnerView | null> {
  const { data: seedRaw } = await service
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("id", seedEntryId)
    .eq("event_id", eventId)
    .maybeSingle();
  const seed = seedRaw as EntryRow | null;
  if (!seed) return null;

  // All of this person's entries in the event (demo runners group by email).
  const emailNorm = seed.email?.trim().toLowerCase() ?? "";
  const { data: allRaw } = await service.from("entries").select(ENTRY_COLUMNS).eq("event_id", eventId);
  const personEntries = ((allRaw ?? []) as EntryRow[]).filter(
    (e) => e.id === seed.id || (emailNorm && e.email?.trim().toLowerCase() === emailNorm),
  );

  const distById = await loadEventDistances(service, eventId);
  const results: DemoRunnerRaceResult[] = [];
  const badges: DemoRunnerBadge[] = [];

  for (const entry of personEntries) {
    const dist = distById.get(entry.distance_id);
    const distanceLabel = dist?.label ?? "Race";
    const { byEntryId, finisherCount, note } = await computeDistanceOutcomes(
      service,
      eventId,
      entry.distance_id,
      dist?.entry_fee_cents ?? 0,
    );
    const outcome =
      byEntryId.get(entry.id) ??
      emptyOutcome(finisherCount, note ?? "No finish time imported for this race yet.");

    results.push({ distanceId: entry.distance_id, distanceLabel, ...outcome });

    if (outcome.division) {
      badges.push({
        key: `division_${outcome.division.toLowerCase()}`,
        title: `${outcome.division} Division`,
        variant: "main",
        division: outcome.division,
        place: outcome.divisionPlace,
        payoutCents: outcome.payoutCents,
        distanceLabel,
      });
    }
    if (outcome.femaleIncentiveDivision && outcome.femaleIncentivePayoutCents > 0) {
      badges.push({
        key: "female_incentive",
        title: "Female Incentive",
        variant: "female",
        division: outcome.femaleIncentiveDivision,
        place: outcome.femaleIncentivePlace,
        payoutCents: outcome.femaleIncentivePayoutCents,
        distanceLabel,
      });
    }
    if (outcome.militaryIncentiveDivision && outcome.militaryIncentivePayoutCents > 0) {
      badges.push({
        key: "military_incentive",
        title: "Military Incentive",
        variant: "military",
        division: outcome.militaryIncentiveDivision,
        place: outcome.militaryIncentivePlace,
        payoutCents: outcome.militaryIncentivePayoutCents,
        distanceLabel,
      });
    }
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

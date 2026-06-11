/**
 * Loads real finishers for a distance: matched finish-time import rows joined to
 * entries and profiles, shaped for the shared console computation. Server-only
 * (service-role client) — used by the results-data GET and the publish POST.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FinisherInput } from "./compute";

export interface FinisherRow extends FinisherInput {
  entryId: string;
  userId: string | null;
  prId: string | null;
  timeMs: number;
}

function ageOn(dob: string | null, onDate: string | null): number {
  if (!dob) return 0;
  const d = new Date(dob);
  const ref = onDate ? new Date(onDate) : new Date();
  if (Number.isNaN(d.getTime()) || Number.isNaN(ref.getTime())) return 0;
  let age = ref.getFullYear() - d.getFullYear();
  const beforeBirthday =
    ref.getMonth() < d.getMonth() || (ref.getMonth() === d.getMonth() && ref.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

export async function loadFinishersForDistance(
  service: SupabaseClient,
  eventId: string,
  distanceId: string,
): Promise<{ finishers: FinisherRow[]; importedRowCount: number }> {
  const { data: rawRows } = await service
    .from("results_raw")
    .select("id,matched_entry_id,match_status,row_json")
    .eq("event_id", eventId)
    .eq("distance_id", distanceId);

  const allRows = (rawRows ?? []) as Array<{
    id: string;
    matched_entry_id: string | null;
    match_status: string;
    row_json: { parsed?: { time_ms?: number | null } } | null;
  }>;

  const matched = allRows.filter(
    (r) =>
      r.match_status === "matched" &&
      r.matched_entry_id &&
      typeof r.row_json?.parsed?.time_ms === "number" &&
      (r.row_json.parsed.time_ms as number) > 0,
  );

  if (matched.length === 0) {
    return { finishers: [], importedRowCount: allRows.length };
  }

  const { data: eventRow } = await service.from("events").select("race_date").eq("id", eventId).single();
  const raceDate = (eventRow as { race_date?: string | null } | null)?.race_date ?? null;

  const entryIds = matched.map((r) => r.matched_entry_id as string);
  const entryById = new Map<
    string,
    {
      id: string;
      user_id: string | null;
      first_name: string;
      last_name: string;
      dob: string | null;
      sex: string | null;
      bib: string | null;
      assigned_bib: string | null;
    }
  >();
  for (let i = 0; i < entryIds.length; i += 500) {
    const { data: entries } = await service
      .from("entries")
      .select("id,user_id,first_name,last_name,dob,sex,bib,assigned_bib")
      .in("id", entryIds.slice(i, i + 500));
    for (const e of (entries ?? []) as Array<(typeof entryById extends Map<string, infer V> ? V : never)>) {
      entryById.set(e.id, e);
    }
  }

  const userIds = [
    ...new Set([...entryById.values()].map((e) => e.user_id).filter((v): v is string => !!v)),
  ];
  const profileByUser = new Map<string, { pr_id: string | null; active_or_retired_military: boolean | null }>();
  for (let i = 0; i < userIds.length; i += 500) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id,pr_id,active_or_retired_military")
      .in("id", userIds.slice(i, i + 500));
    for (const p of (profiles ?? []) as Array<{
      id: string;
      pr_id: string | null;
      active_or_retired_military: boolean | null;
    }>) {
      profileByUser.set(p.id, p);
    }
  }

  const finishers: FinisherRow[] = [];
  for (const r of matched) {
    const entry = entryById.get(r.matched_entry_id as string);
    if (!entry) continue;
    const profile = entry.user_id ? profileByUser.get(entry.user_id) : undefined;
    const timeMs = r.row_json!.parsed!.time_ms as number;
    const prId = profile?.pr_id?.trim() || null;
    finishers.push({
      entryId: entry.id,
      userId: entry.user_id,
      prId,
      timeMs,
      id: prId ?? entry.id,
      bib: entry.assigned_bib?.trim() || prId || entry.bib?.trim() || "",
      first: entry.first_name,
      last: entry.last_name,
      age: ageOn(entry.dob, raceDate),
      sex: (entry.sex ?? "").toLowerCase().startsWith("f") ? "Female" : "Male",
      timeS: Math.round(timeMs / 1000),
      military: profile?.active_or_retired_military === true,
    });
  }

  finishers.sort((a, b) => a.timeS - b.timeS);
  return { finishers, importedRowCount: allRows.length };
}

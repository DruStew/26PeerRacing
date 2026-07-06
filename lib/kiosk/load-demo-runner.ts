/**
 * Check-in runner payload for demo-event entries (no auth profile / membership).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDistanceDisplay } from "@/lib/distance-display";

type DistanceRow = {
  id: string;
  label: string | null;
  race_name?: string | null;
  gun_time?: string | null;
  sort_order?: number | null;
  results_published_at?: string | null;
  entry_fee_cents: number | null;
  is_peer_racing_qualifier?: boolean | null;
  allow_roll_over_from_qualifier?: boolean | null;
  allow_qualifier_split_to_roll_over_here?: boolean | null;
};

function distanceLabel(d: Pick<DistanceRow, "label" | "race_name">): string {
  return formatDistanceDisplay({ label: d.label ?? "Race", race_name: d.race_name });
}

function entriesForDemoPerson<T extends { user_id?: string | null; email?: string | null; id?: string }>(
  all: T[],
  seed: T,
): T[] {
  const emailNorm = seed.email?.trim().toLowerCase() ?? "";
  return all.filter((e) => {
    if (seed.user_id && e.user_id === seed.user_id) return true;
    if (!seed.user_id && emailNorm && e.email?.trim().toLowerCase() === emailNorm) return true;
    return seed.id != null && e.id === seed.id;
  });
}

export async function loadDemoRunnerContext(
  admin: SupabaseClient,
  eventId: string,
  entryId: string,
): Promise<Record<string, unknown> | null> {
  const { data: seedEntry } = await admin
    .from("entries")
    .select("*")
    .eq("id", entryId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!seedEntry || (seedEntry as { user_id?: string | null }).user_id) {
    return null;
  }

  const seed = seedEntry as {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    bib: string | null;
    assigned_bib?: string | null;
  };

  const { data: allEventEntries } = await admin.from("entries").select("*").eq("event_id", eventId);
  const entriesRaw = entriesForDemoPerson(allEventEntries ?? [], seedEntry).sort(
    (a, b) =>
      new Date(String((a as { created_at?: string }).created_at ?? 0)).getTime() -
      new Date(String((b as { created_at?: string }).created_at ?? 0)).getTime(),
  );

  const { data: distancesRaw } = await admin
    .from("distances")
    .select(
      "id,label,race_name,gun_time,sort_order,results_published_at,entry_fee_cents,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here",
    )
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  const distances = ((distancesRaw ?? []) as DistanceRow[]).filter((d) => !d.results_published_at);
  const distById = new Map(distances.map((d) => [d.id, d]));

  const entriesMapped = entriesRaw.map((e) => {
    const row = e as {
      id: string;
      distance_id: string;
      entry_type: string;
      source_entry_id: string | null;
      entry_kind: string;
      paid_at: string | null;
      paid_amount_cents: number | null;
      transponder_1: string | null;
      transponder_2: string | null;
      bib: string | null;
      assigned_bib?: string | null;
      kiosk_checked_in_at?: string | null;
    };
    return {
      ...row,
      kiosk_checked_in_at: row.kiosk_checked_in_at ?? null,
      distance_label: distById.get(row.distance_id)
        ? distanceLabel(distById.get(row.distance_id)!)
        : "Race",
    };
  });

  const finishTimeByEntry = new Map<string, { ms: number; display: string }>();
  const entryIds = entriesMapped.map((e) => e.id);
  if (entryIds.length > 0) {
    const { data: rawRows } = await admin
      .from("results_raw")
      .select("matched_entry_id,row_json,match_status")
      .eq("event_id", eventId)
      .in("matched_entry_id", entryIds);
    for (const r of (rawRows ?? []) as Array<{
      matched_entry_id: string | null;
      match_status: string;
      row_json: { parsed?: { time_ms?: number | null; time_display?: string | null } } | null;
    }>) {
      if (r.match_status !== "matched" || !r.matched_entry_id) continue;
      const ms = r.row_json?.parsed?.time_ms;
      if (typeof ms !== "number" || ms <= 0) continue;
      const display = r.row_json?.parsed?.time_display?.trim() || null;
      finishTimeByEntry.set(r.matched_entry_id, { ms, display: display ?? String(ms) });
    }
  }

  const entries = entriesMapped.map((e) => {
    const ft = finishTimeByEntry.get(e.id);
    return {
      ...e,
      finish_time_ms: ft?.ms ?? null,
      finish_time_display: ft?.display ?? null,
    };
  });

  const displayBib = seed.assigned_bib?.trim() || seed.bib?.trim() || null;

  return {
    ok: true,
    demoMode: true,
    profile: {
      id: seed.id,
      first_name: seed.first_name,
      last_name: seed.last_name,
      email: seed.email,
      phone: seed.phone,
      pr_id: displayBib,
    },
    profileComplete: true,
    membership: undefined,
    entries,
    upsellDistances: [],
    rollOverOptions: [],
    isWalkUp: false,
    enterFlow: undefined,
  };
}

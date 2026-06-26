import type { SupabaseClient } from "@supabase/supabase-js";

export type RaceEntryPendingPayload = {
  primaryDistanceIds: string[];
  rollOverSelections: { targetDistanceId: string; sourceDistanceId: string }[];
  bib: string | null;
  /** Cents to debit from wallet when Stripe checkout completes (remainder charged on Stripe). */
  walletAppliedCents?: number;
  /** Kiosk walk-up: apply paid membership tier when checkout completes. */
  kioskWalkUpMembership?: {
    tier: string;
    priceCents: number;
  };
};

type DistanceRow = {
  id: string;
  pr_cutoff?: string | null;
  entry_fee_cents?: number | null;
};

function paidAmountCentsForDistance(
  entryKind: "free" | "paid",
  dist: DistanceRow | undefined,
): number | null {
  if (entryKind !== "paid" || !dist) return null;
  const c = typeof dist.entry_fee_cents === "number" ? dist.entry_fee_cents : 0;
  return c > 0 ? c : null;
}

type EventRow = { pr_cutoff?: string | null };

/**
 * Inserts primary + roll-over entries after validation has already passed.
 * Used by free entry POST and by Stripe webhook fulfillment.
 */
export async function insertRaceEntriesForUser(
  supabase: SupabaseClient,
  args: {
    eventId: string;
    userId: string;
    profile: {
      first_name?: string | null;
      last_name?: string | null;
      phone?: string | null;
      email?: string | null;
      dob?: string | null;
      sex?: string | null;
    };
    userPhoneFallback: string;
    userEmailFallback: string;
    event: EventRow;
    allDistances: DistanceRow[];
    primaryDistanceIds: string[];
    rollOverSelections: { targetDistanceId: string; sourceDistanceId: string }[];
    qualifierId: string | null;
    allowedRollOverTargets: Set<string>;
    bib: string | null;
    entryKind: "free" | "paid";
    paidAtIso: string | null;
  },
): Promise<{ ok: true; firstCreatedAt: string } | { ok: false; error: string }> {
  const {
    eventId,
    userId,
    profile,
    userPhoneFallback,
    userEmailFallback,
    event,
    allDistances,
    primaryDistanceIds,
    rollOverSelections,
    qualifierId,
    allowedRollOverTargets,
    bib,
    entryKind,
    paidAtIso,
  } = args;

  const phoneVal =
    profile.phone?.trim() || userPhoneFallback || userEmailFallback || "";
  const firstName = profile.first_name?.trim() ?? "";
  const lastName = profile.last_name?.trim() ?? "";
  const email = profile.email?.trim() || userEmailFallback || "";
  const dob = profile.dob ?? "";
  const sex = profile.sex ?? "";

  const basePayload = {
    event_id: eventId,
    user_id: userId,
    first_name: firstName,
    last_name: lastName,
    phone: phoneVal,
    email,
    dob,
    sex,
    bib,
    entry_kind: entryKind,
    eligible: true,
    paid_at: paidAtIso,
  };

  const distances = allDistances.filter((d) => primaryDistanceIds.includes(d.id));
  const now = new Date();
  const primaryEntryByDistance = new Map<string, { id: string; created_at: string }>();

  /** Roll-over targets may reference a qualifier primary that was entered earlier (not in this insert batch). */
  const rollSources = new Set(rollOverSelections.map((r) => r.sourceDistanceId));
  for (const sid of rollSources) {
    if (primaryDistanceIds.includes(sid)) continue;
    const { data: existingPrimary } = await supabase
      .from("entries")
      .select("id,created_at")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .eq("distance_id", sid)
      .eq("entry_type", "primary")
      .maybeSingle();
    if (existingPrimary) {
      const row = existingPrimary as { id: string; created_at: string };
      primaryEntryByDistance.set(sid, { id: row.id, created_at: row.created_at });
    }
  }

  let lastCreatedAt = now.toISOString();

  for (const distanceId of primaryDistanceIds) {
    const dist = distances.find((d) => d.id === distanceId);
    const cutoffSnapshot = dist?.pr_cutoff ?? event.pr_cutoff;
    const { data: entry, error: insertError } = await supabase
      .from("entries")
      .insert({
        ...basePayload,
        distance_id: distanceId,
        entry_type: "primary",
        source_entry_id: null,
        cutoff_snapshot: cutoffSnapshot ?? now.toISOString(),
        paid_amount_cents: paidAmountCentsForDistance(entryKind, dist),
      })
      .select("id,created_at")
      .single();

    if (insertError || !entry) {
      return { ok: false, error: insertError?.message ?? "Insert failed" };
    }
    primaryEntryByDistance.set(distanceId, { id: entry.id, created_at: entry.created_at });
    lastCreatedAt = entry.created_at;
  }

  for (const { targetDistanceId, sourceDistanceId } of rollOverSelections) {
    if (sourceDistanceId !== qualifierId || !allowedRollOverTargets.has(targetDistanceId)) {
      continue;
    }
    const sourceEntry = primaryEntryByDistance.get(sourceDistanceId);
    if (!sourceEntry) continue;

    const { data: existingRoll } = await supabase
      .from("entries")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .eq("distance_id", targetDistanceId)
      .maybeSingle();
    if (existingRoll) continue;

    const dist = allDistances.find((d) => d.id === targetDistanceId);
    const cutoffSnapshot = dist?.pr_cutoff ?? event.pr_cutoff;
    const { data: rollIns, error: rollErr } = await supabase
      .from("entries")
      .insert({
        ...basePayload,
        distance_id: targetDistanceId,
        entry_type: "roll_over",
        source_entry_id: sourceEntry.id,
        cutoff_snapshot: cutoffSnapshot ?? now.toISOString(),
        paid_amount_cents: paidAmountCentsForDistance(entryKind, dist),
      })
      .select("created_at")
      .single();
    if (rollErr) {
      return { ok: false, error: rollErr.message };
    }
    if (rollIns?.created_at) lastCreatedAt = rollIns.created_at as string;
  }

  return { ok: true, firstCreatedAt: lastCreatedAt };
}

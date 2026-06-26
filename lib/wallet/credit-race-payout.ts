import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Race winnings → wallet. When a producer publishes a distance, each racer's net
 * payout (main division + female/military incentives) is credited to their wallet
 * as a `race_payout` row. Re-publishing or unpublishing first reverses prior
 * credits for that distance so balances never double-count.
 *
 * Idempotency key: metadata.distance_id. Reversal deletes the prior credits
 * (simplest, mirrors the shootout-fund ledger). Caveat: if a racer already SPENT
 * winnings on a new entry, reversing on re-publish can push their balance
 * negative until the fresh credit lands — acceptable for an admin re-publish.
 */

function looksLikeUnknownSourceColumn(err: { message?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    (m.includes("source") && (m.includes("schema cache") || m.includes("does not exist"))) ||
    m.includes("could not find the 'source'")
  );
}

export type RacePayoutCredit = {
  userId: string;
  entryId: string | null;
  resultId: string | null;
  amountCents: number;
};

/** Remove all race-winnings credits previously banked for a distance. */
export async function reverseRacePayoutsForDistance(
  service: SupabaseClient,
  distanceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await service
    .from("wallet_ledger")
    .delete()
    .eq("category", "race_payout")
    .eq("metadata->>distance_id", distanceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Credit each racer's net winnings for a distance. Reverses prior credits first. */
export async function creditRacePayoutsForDistance(
  service: SupabaseClient,
  args: {
    eventId: string;
    distanceId: string;
    eventName: string;
    distanceLabel: string;
    credits: RacePayoutCredit[];
  },
): Promise<{ ok: true; racersPaid: number; totalCents: number } | { ok: false; error: string }> {
  const reversed = await reverseRacePayoutsForDistance(service, args.distanceId);
  if (!reversed.ok) return reversed;

  const rows = args.credits
    .filter((c) => c.userId && c.amountCents > 0)
    .map((c) => ({
      user_id: c.userId,
      amount_cents: Math.round(c.amountCents),
      category: "race_payout" as const,
      label: `Race winnings — ${args.eventName} · ${args.distanceLabel}`,
      metadata: {
        event_id: args.eventId,
        distance_id: args.distanceId,
        result_id: c.resultId,
      },
      related_entry_id: c.entryId,
    }));

  if (rows.length === 0) return { ok: true, racersPaid: 0, totalCents: 0 };

  const withSource = rows.map((r) => ({ ...r, source: "race_payout" }));
  let { error } = await service.from("wallet_ledger").insert(withSource);
  if (error && looksLikeUnknownSourceColumn(error)) {
    ({ error } = await service.from("wallet_ledger").insert(rows));
  }
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    racersPaid: rows.length,
    totalCents: rows.reduce((s, r) => s + r.amount_cents, 0),
  };
}

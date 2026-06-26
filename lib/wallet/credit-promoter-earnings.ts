import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Promoter producer cut → wallet. Credited on publish as `promoter_event_earnings`.
 * Separate from `race_payout` so promoter earnings never appear in racer "Total won".
 */

function looksLikeUnknownSourceColumn(err: { message?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    (m.includes("source") && (m.includes("schema cache") || m.includes("does not exist"))) ||
    m.includes("could not find the 'source'")
  );
}

/** Remove promoter earnings previously credited for a distance. */
export async function reversePromoterEarningsForDistance(
  service: SupabaseClient,
  distanceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await service
    .from("wallet_ledger")
    .delete()
    .eq("category", "promoter_event_earnings")
    .eq("metadata->>distance_id", distanceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Credit the event promoter's producer cut for a published distance. */
export async function creditPromoterEarningsForDistance(
  service: SupabaseClient,
  args: {
    eventId: string;
    distanceId: string;
    promoterId: string;
    eventName: string;
    distanceLabel: string;
    amountCents: number;
  },
): Promise<{ ok: true; creditedCents: number } | { ok: false; error: string }> {
  const amount = Math.round(args.amountCents);
  if (amount <= 0) {
    await reversePromoterEarningsForDistance(service, args.distanceId);
    return { ok: true, creditedCents: 0 };
  }

  const reversed = await reversePromoterEarningsForDistance(service, args.distanceId);
  if (!reversed.ok) return reversed;

  const row = {
    user_id: args.promoterId,
    amount_cents: amount,
    category: "promoter_event_earnings" as const,
    label: `Event earnings — ${args.eventName} · ${args.distanceLabel}`,
    metadata: {
      event_id: args.eventId,
      distance_id: args.distanceId,
    },
  };

  const withSource = { ...row, source: "promoter_event_earnings" };
  let { error } = await service.from("wallet_ledger").insert(withSource);
  if (error && looksLikeUnknownSourceColumn(error)) {
    ({ error } = await service.from("wallet_ledger").insert(row));
  }
  if (error) return { ok: false, error: error.message };

  return { ok: true, creditedCents: amount };
}

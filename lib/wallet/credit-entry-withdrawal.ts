import type { SupabaseClient } from "@supabase/supabase-js";

import { netWalletCreditFromGrossCents } from "@/lib/wallet/stripe-fee";

type CreditArgs = {
  userId: string;
  entryId: string;
  eventId: string;
  entryKind: string;
  paidAt: string | null;
  paidAmountCents: number | null;
  distanceEntryFeeCents: number | null;
  distanceLabel: string | null;
};

function looksLikeMissingColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    m.includes("category") ||
    m.includes("schema cache") ||
    (m.includes("column") && m.includes("does not exist"))
  );
}

/** New-only wallet table (20260430) has no `source` column; hybrid / MVP tables do. */
function looksLikeUnknownSourceColumn(err: { message?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    (m.includes("source") && (m.includes("schema cache") || m.includes("does not exist"))) ||
    m.includes("could not find the 'source'")
  );
}

/**
 * Records a wallet credit when a paid entry is withdrawn while registration is open.
 * Idempotent via unique index on (related_entry_id) for entry_withdrawal_credit when that index exists.
 *
 * Supports: full app schema; hybrid (legacy `source NOT NULL` + new `category`); legacy MVP (`source`/`ref_id` only).
 */
export async function insertWalletCreditForEntryWithdrawal(
  db: SupabaseClient,
  args: CreditArgs,
): Promise<
  | { ok: true; creditedCents: number; duplicate?: boolean }
  | { ok: false; reason: string }
> {
  if (args.entryKind !== "paid" || !args.paidAt) {
    return { ok: false, reason: "not_paid_entry" };
  }

  const gross =
    typeof args.paidAmountCents === "number" && args.paidAmountCents > 0
      ? args.paidAmountCents
      : typeof args.distanceEntryFeeCents === "number" && args.distanceEntryFeeCents > 0
        ? args.distanceEntryFeeCents
        : 0;

  if (gross <= 0) {
    return { ok: true, creditedCents: 0 };
  }

  const net = netWalletCreditFromGrossCents(gross);
  if (net <= 0) {
    return { ok: true, creditedCents: 0 };
  }

  const netInt = Math.round(Number(net));

  const modern = {
    user_id: args.userId,
    amount_cents: netInt,
    category: "entry_withdrawal_credit",
    label: `Entry withdrawal — ${args.distanceLabel ?? "race"}`,
    metadata: {
      event_id: args.eventId,
      gross_cents: gross,
      estimated_stripe_fee_cents: gross - net,
      fee_model: "us_card_2.9pct_plus_30c_estimate",
    },
    related_entry_id: args.entryId,
  };

  // Hybrid DBs: MVP left `source text not null`; app fills `category` — must also set `source`.
  const modernPlusLegacySource = {
    ...modern,
    source: "entry_withdrawal_credit",
  };

  let { error } = await db.from("wallet_ledger").insert(modernPlusLegacySource);

  if (error && looksLikeUnknownSourceColumn(error)) {
    ({ error } = await db.from("wallet_ledger").insert(modern));
  }

  if (error && looksLikeMissingColumnError(error)) {
    const { data: dup } = await db
      .from("wallet_ledger")
      .select("id")
      .eq("user_id", args.userId)
      .eq("ref_id", args.entryId)
      .maybeSingle();

    if (dup) {
      return { ok: true, creditedCents: 0, duplicate: true };
    }

    ({ error } = await db.from("wallet_ledger").insert({
      user_id: args.userId,
      amount_cents: netInt,
      source: "entry_withdrawal_credit",
      ref_id: args.entryId,
    }));
  }

  if (error) {
    if (error.code === "23505") {
      return { ok: true, creditedCents: 0, duplicate: true };
    }
    return { ok: false, reason: error.message };
  }

  return { ok: true, creditedCents: netInt };
}

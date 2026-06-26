import type { SupabaseClient } from "@supabase/supabase-js";

import { sumWalletBalanceCents } from "@/lib/wallet/balance";

function looksLikeUnknownSourceColumn(err: { message?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    (m.includes("source") && (m.includes("schema cache") || m.includes("does not exist"))) ||
    m.includes("could not find the 'source'")
  );
}

const INSUFFICIENT_MESSAGE =
  "Wallet balance changed — not enough to cover this entry. Refresh and try again.";

function looksLikeMissingFunction(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    err.code === "PGRST202" ||
    m.includes("could not find the function") ||
    (m.includes("function") && m.includes("does not exist")) ||
    m.includes("schema cache")
  );
}

export async function walletApplyDebitForRaceEntry(
  admin: SupabaseClient,
  args: {
    userId: string;
    amountCents: number;
    eventId: string;
    eventName: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (args.amountCents <= 0) return { ok: true };

  const label = `Race entry — ${args.eventName}`;
  const metadata = { ...(args.metadata ?? {}), event_id: args.eventId };

  // Preferred path: atomic, advisory-locked debit in the DB. It re-reads the
  // balance under a per-user lock and rejects overdraft, so concurrent entries
  // (double-submit / two tabs) can never overspend the wallet.
  const rpc = await admin.rpc("wallet_apply_debit_for_race_entry", {
    p_user_id: args.userId,
    p_amount_cents: args.amountCents,
    p_event_id: args.eventId,
    p_label: label,
    p_metadata: args.metadata ?? {},
  });
  if (!rpc.error) return { ok: true };

  const rpcMsg = (rpc.error.message ?? "").toLowerCase();
  if (rpcMsg.includes("insufficient_wallet_balance") || rpc.error.code === "P0001") {
    return { ok: false, message: INSUFFICIENT_MESSAGE };
  }
  // Only fall back if the RPC simply isn't deployed; any other RPC error is real.
  if (!looksLikeMissingFunction(rpc.error)) {
    return { ok: false, message: rpc.error.message };
  }

  // Fallback (older DBs without the RPC): best-effort JS check + insert. Not
  // concurrency-safe, but matches legacy behavior until the migration is applied.
  const bal = await sumWalletBalanceCents(admin, args.userId);
  if (bal < args.amountCents) {
    return { ok: false, message: INSUFFICIENT_MESSAGE };
  }

  const base = {
    user_id: args.userId,
    amount_cents: -args.amountCents,
    category: "entry_payment_from_wallet" as const,
    label,
    metadata,
  };
  const withSource = { ...base, source: "entry_payment_from_wallet" };

  let { error } = await admin.from("wallet_ledger").insert(withSource);
  if (error && looksLikeUnknownSourceColumn(error)) {
    ({ error } = await admin.from("wallet_ledger").insert(base));
  }

  if (error) {
    const m = error.message ?? "";
    if (m.includes("insufficient_wallet_balance") || m.includes("P0001")) {
      return { ok: false, message: INSUFFICIENT_MESSAGE };
    }
    return { ok: false, message: m };
  }
  return { ok: true };
}

export async function walletCreditAdjustment(
  admin: SupabaseClient,
  args: {
    userId: string;
    amountCents: number;
    label: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (args.amountCents <= 0) return;

  const rpc = await admin.rpc("wallet_credit_adjustment", {
    p_user_id: args.userId,
    p_amount_cents: args.amountCents,
    p_label: args.label,
    p_metadata: args.metadata ?? {},
  });
  if (!rpc.error) return;

  if (!looksLikeMissingFunction(rpc.error)) {
    console.error("walletCreditAdjustment RPC:", rpc.error.message);
    return;
  }

  const base = {
    user_id: args.userId,
    amount_cents: args.amountCents,
    category: "adjustment" as const,
    label: args.label,
    metadata: args.metadata ?? {},
  };
  const withSource = { ...base, source: "adjustment" };

  let { error } = await admin.from("wallet_ledger").insert(withSource);
  if (error && looksLikeUnknownSourceColumn(error)) {
    ({ error } = await admin.from("wallet_ledger").insert(base));
  }
  if (error) {
    console.error("walletCreditAdjustment:", error.message);
  }
}

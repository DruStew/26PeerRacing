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

  const bal = await sumWalletBalanceCents(admin, args.userId);
  if (bal < args.amountCents) {
    return {
      ok: false,
      message: "Wallet balance changed — not enough to cover this entry. Refresh and try again.",
    };
  }

  const label = `Race entry — ${args.eventName}`;
  const metadata = { ...(args.metadata ?? {}), event_id: args.eventId };
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
      return {
        ok: false,
        message: "Wallet balance changed — not enough to cover this entry. Refresh and try again.",
      };
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

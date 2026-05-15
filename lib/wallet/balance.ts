import type { SupabaseClient } from "@supabase/supabase-js";

/** Sum of wallet_ledger.amount_cents for the user (credits positive, debits negative). */
export async function sumWalletBalanceCents(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("wallet_ledger")
    .select("amount_cents")
    .eq("user_id", userId);

  if (error || !data) return 0;
  return data.reduce((s, r) => s + Number((r as { amount_cents?: number }).amount_cents ?? 0), 0);
}

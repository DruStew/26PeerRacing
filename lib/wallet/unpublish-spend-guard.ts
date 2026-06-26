import type { SupabaseClient } from "@supabase/supabase-js";

import { sumWalletBalanceCents } from "@/lib/wallet/balance";

export type UnpublishSpendBlocker = {
  userId: string;
  name: string;
  role: "racer" | "promoter";
  creditCents: number;
  balanceCents: number;
  shortfallCents: number;
};

type LedgerCreditRow = {
  user_id: string;
  amount_cents: number;
};

async function creditsByUserForDistance(
  service: SupabaseClient,
  distanceId: string,
  category: "race_payout" | "promoter_event_earnings",
): Promise<Map<string, number>> {
  const { data, error } = await service
    .from("wallet_ledger")
    .select("user_id,amount_cents")
    .eq("category", category)
    .eq("metadata->>distance_id", distanceId);

  if (error || !data) return new Map();

  const byUser = new Map<string, number>();
  for (const row of data as LedgerCreditRow[]) {
    const uid = row.user_id;
    byUser.set(uid, (byUser.get(uid) ?? 0) + Number(row.amount_cents ?? 0));
  }
  return byUser;
}

async function profileNames(
  service: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data } = await service
    .from("profiles")
    .select("id,first_name,last_name")
    .in("id", userIds);

  const names = new Map<string, string>();
  for (const p of (data ?? []) as Array<{ id: string; first_name?: string | null; last_name?: string | null }>) {
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    names.set(p.id, full || p.id.slice(0, 8));
  }
  return names;
}

/**
 * Returns users who would go negative if this distance's wallet credits were clawed back.
 * Blocks unpublish when winnings (or promoter earnings) were already spent elsewhere.
 */
export async function getUnpublishSpendBlockers(
  service: SupabaseClient,
  distanceId: string,
): Promise<UnpublishSpendBlocker[]> {
  const racerCredits = await creditsByUserForDistance(service, distanceId, "race_payout");
  const promoterCredits = await creditsByUserForDistance(service, distanceId, "promoter_event_earnings");

  const allUserIds = [...new Set([...racerCredits.keys(), ...promoterCredits.keys()])];
  const names = await profileNames(service, allUserIds);

  const blockers: UnpublishSpendBlocker[] = [];

  for (const [userId, creditCents] of racerCredits) {
    if (creditCents <= 0) continue;
    const balanceCents = await sumWalletBalanceCents(service, userId);
    if (balanceCents < creditCents) {
      blockers.push({
        userId,
        name: names.get(userId) ?? userId.slice(0, 8),
        role: "racer",
        creditCents,
        balanceCents,
        shortfallCents: creditCents - balanceCents,
      });
    }
  }

  for (const [userId, creditCents] of promoterCredits) {
    if (creditCents <= 0) continue;
    const balanceCents = await sumWalletBalanceCents(service, userId);
    if (balanceCents < creditCents) {
      blockers.push({
        userId,
        name: names.get(userId) ?? userId.slice(0, 8),
        role: "promoter",
        creditCents,
        balanceCents,
        shortfallCents: creditCents - balanceCents,
      });
    }
  }

  return blockers.sort((a, b) => b.shortfallCents - a.shortfallCents);
}

export function formatUnpublishBlockersMessage(blockers: UnpublishSpendBlocker[]): string {
  const lines = blockers.slice(0, 5).map((b) => {
    const role = b.role === "promoter" ? "Promoter" : "Racer";
    const credit = (b.creditCents / 100).toFixed(2);
    const balance = (b.balanceCents / 100).toFixed(2);
    return `${role} ${b.name}: credited $${credit}, wallet now $${balance}`;
  });
  const more = blockers.length > 5 ? ` (+${blockers.length - 5} more)` : "";
  return `Cannot unpublish — wallet winnings were already spent: ${lines.join("; ")}${more}`;
}

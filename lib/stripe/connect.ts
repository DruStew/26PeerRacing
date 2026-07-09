import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stripe Connect Express accounts for wallet cash-outs. One account per user,
 * created lazily the first time they set up payouts. Status is mirrored into
 * stripe_connect_accounts and refreshed from Stripe on demand (plus the
 * account.updated webhook when configured).
 */

export type ConnectAccountRow = {
  user_id: string;
  stripe_account_id: string;
  details_submitted: boolean;
  payouts_enabled: boolean;
};

export async function getConnectAccountRow(
  service: SupabaseClient,
  userId: string,
): Promise<ConnectAccountRow | null> {
  const { data } = await service
    .from("stripe_connect_accounts")
    .select("user_id,stripe_account_id,details_submitted,payouts_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ConnectAccountRow | null) ?? null;
}

/** Existing account or a fresh Express account persisted for the user. */
export async function getOrCreateConnectAccount(
  service: SupabaseClient,
  stripe: Stripe,
  userId: string,
  email: string | null,
): Promise<ConnectAccountRow> {
  const existing = await getConnectAccountRow(service, userId);
  if (existing) return existing;

  const account = await stripe.accounts.create({
    type: "express",
    email: email ?? undefined,
    business_type: "individual",
    capabilities: { transfers: { requested: true } },
    business_profile: {
      // Skill-based sports competition prize payouts (not gambling).
      product_description: "Trail and road race prize winnings paid to the racer who earned them.",
      mcc: "7941", // sports clubs/fields — commercial sports
    },
    metadata: { peer_racing_user_id: userId },
  });

  const row: ConnectAccountRow = {
    user_id: userId,
    stripe_account_id: account.id,
    details_submitted: Boolean(account.details_submitted),
    payouts_enabled: Boolean(account.payouts_enabled),
  };
  const { error } = await service.from("stripe_connect_accounts").insert(row);
  if (error) {
    // Unique race (double-click): fall back to the row the other request made.
    const again = await getConnectAccountRow(service, userId);
    if (again) return again;
    throw new Error(error.message);
  }
  return row;
}

/** Pull current status from Stripe and mirror it into the DB. */
export async function refreshConnectStatus(
  service: SupabaseClient,
  stripe: Stripe,
  row: ConnectAccountRow,
): Promise<ConnectAccountRow> {
  const account = await stripe.accounts.retrieve(row.stripe_account_id);
  const updated: ConnectAccountRow = {
    ...row,
    details_submitted: Boolean(account.details_submitted),
    payouts_enabled: Boolean(account.payouts_enabled),
  };
  if (
    updated.details_submitted !== row.details_submitted ||
    updated.payouts_enabled !== row.payouts_enabled
  ) {
    await service
      .from("stripe_connect_accounts")
      .update({
        details_submitted: updated.details_submitted,
        payouts_enabled: updated.payouts_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", row.user_id);
  }
  return updated;
}

import type Stripe from "stripe";

import { membershipTierFromRow, type MembershipRow } from "@/lib/membership";
import type { MembershipTier } from "@/lib/membership-tiers";
import { checkoutTierFromPriceIdAsync } from "@/lib/stripe/membership-prices";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { getStripe } from "@/lib/stripe/server";

function tierFromSession(session: Stripe.Checkout.Session): MembershipTier | null {
  const meta = session.metadata?.membership_tier?.trim();
  if (!meta || meta === "free") return null;
  return meta as MembershipTier;
}

function periodEndIso(sub: Stripe.Subscription): string {
  return new Date(sub.current_period_end * 1000).toISOString();
}

async function cancelPriorSubscription(subscriptionId: string | null | undefined): Promise<void> {
  if (!subscriptionId) return;
  const stripe = getStripe();
  if (!stripe) return;
  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch {
    /* already canceled */
  }
}

/** Apply subscription checkout or renewal to memberships row. */
export async function applyMembershipSubscription(args: {
  userId: string;
  tier: MembershipTier;
  customerId: string | null;
  subscriptionId: string | null;
  periodEndIso: string;
  checkoutSessionId?: string | null;
}): Promise<void> {
  if (!args.tier || args.tier === "free") return;

  const service = createServiceRoleSupabaseClient();
  if (!service) return;

  const { data: current } = await service
    .from("memberships")
    .select("renewal_count,stripe_subscription_id,stripe_last_checkout_session_id")
    .eq("user_id", args.userId)
    .maybeSingle();

  if (
    args.checkoutSessionId &&
    current?.stripe_last_checkout_session_id === args.checkoutSessionId
  ) {
    return;
  }

  const priorSub = (current as { stripe_subscription_id?: string | null } | null)
    ?.stripe_subscription_id;
  if (priorSub && args.subscriptionId && priorSub !== args.subscriptionId) {
    await cancelPriorSubscription(priorSub);
  }

  const now = new Date().toISOString();
  const nextCount =
    args.checkoutSessionId && current
      ? (current.renewal_count ?? 0) + 1
      : (current?.renewal_count ?? 0);

  const patch: Record<string, unknown> = {
    status: "active",
    tier: args.tier,
    membership_end_at: args.periodEndIso,
    updated_at: now,
    provider: "stripe",
    provider_customer_id: args.customerId,
    stripe_subscription_id: args.subscriptionId,
  };
  if (args.checkoutSessionId) {
    patch.stripe_last_checkout_session_id = args.checkoutSessionId;
    patch.renewal_count = nextCount;
  }

  if (!current) {
    await service.from("memberships").insert({
      user_id: args.userId,
      membership_start_at: now,
      renewal_count: 0,
      welcome_shown_at: null,
      ...patch,
    });
    return;
  }

  await service.from("memberships").update(patch).eq("user_id", args.userId);
}

/** Idempotent: membership after Checkout (subscription or legacy one-time). */
export async function fulfillMembershipFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.user_id;
  if (!userId || session.metadata?.checkout_kind !== "membership") return;

  const tier = tierFromSession(session);
  if (!tier || tier === "free") return;

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  const stripe = getStripe();

  if (session.mode === "subscription" && session.subscription && stripe) {
    const subId =
      typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    const sub = await stripe.subscriptions.retrieve(subId);
    if (sub.status !== "active" && sub.status !== "trialing") return;

    await applyMembershipSubscription({
      userId,
      tier,
      customerId,
      subscriptionId: sub.id,
      periodEndIso: periodEndIso(sub),
      checkoutSessionId: session.id,
    });
    return;
  }

  if (session.payment_status !== "paid") return;

  const now = new Date();
  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  await applyMembershipSubscription({
    userId,
    tier,
    customerId,
    subscriptionId: null,
    periodEndIso: oneYearLater.toISOString(),
    checkoutSessionId: session.id,
  });
}

export async function syncMembershipFromSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = sub.metadata?.user_id;
  if (!userId) return;

  let tier: MembershipTier | null = null;
  const metaTier = sub.metadata?.membership_tier?.trim();
  if (metaTier && metaTier !== "free") {
    tier = metaTier as MembershipTier;
  } else {
    const priceId = sub.items.data[0]?.price?.id;
    if (priceId) tier = await checkoutTierFromPriceIdAsync(priceId);
  }
  if (!tier || tier === "free") return;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

  if (sub.status === "active" || sub.status === "trialing") {
    await applyMembershipSubscription({
      userId,
      tier,
      customerId,
      subscriptionId: sub.id,
      periodEndIso: periodEndIso(sub),
    });
    return;
  }

  if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired") {
    await downgradeMembershipToFree(userId);
  }
}

export async function downgradeMembershipToFree(userId: string): Promise<void> {
  const service = createServiceRoleSupabaseClient();
  if (!service) return;
  await service
    .from("memberships")
    .update({
      tier: "free",
      status: "active",
      membership_end_at: null,
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export function membershipRowTier(m: MembershipRow | null): MembershipTier {
  return membershipTierFromRow(m);
}

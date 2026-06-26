import type { MembershipTier } from "@/lib/membership-tiers";

import { fetchMembershipTierConfigs } from "@/lib/membership-tier-config.server";



/** Stripe Price IDs for annual subscription tiers (auto-renew). */

export async function stripePriceIdForTierAsync(tier: string): Promise<string | null> {

  const configs = await fetchMembershipTierConfigs();

  const row = configs.find((c) => c.slug === tier);

  if (row?.stripe_price_id?.trim()) {

    return row.stripe_price_id.trim();

  }

  return stripePriceIdForTierEnv(tier);

}



export function stripePriceIdForTier(tier: "pr_team" | "top_tier"): string | null {

  return stripePriceIdForTierEnv(tier);

}



function stripePriceIdForTierEnv(tier: string): string | null {

  if (tier === "pr_team") {

    return (

      process.env.STRIPE_PRICE_PR_TEAM_ANNUAL?.trim() ||

      process.env.STRIPE_PRICE_MEMBERSHIP_ANNUAL?.trim() ||

      null

    );

  }

  if (tier === "top_tier") {

    return process.env.STRIPE_PRICE_TOP_TIER_ANNUAL?.trim() || null;

  }

  return null;

}



export async function membershipSubscriptionConfiguredAsync(tier: string): Promise<boolean> {

  const priceId = await stripePriceIdForTierAsync(tier);

  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && priceId);

}



export function membershipSubscriptionConfigured(tier: "pr_team" | "top_tier"): boolean {

  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && stripePriceIdForTier(tier));

}



export async function anyPaidMembershipCheckoutConfiguredAsync(): Promise<boolean> {

  const configs = await fetchMembershipTierConfigs();

  const paid = configs.filter((c) => c.is_active && c.is_paid);

  for (const t of paid) {

    if (await membershipSubscriptionConfiguredAsync(t.slug)) return true;

  }

  return membershipSubscriptionConfigured("pr_team") || membershipSubscriptionConfigured("top_tier");

}



export function anyPaidMembershipCheckoutConfigured(): boolean {

  return membershipSubscriptionConfigured("pr_team") || membershipSubscriptionConfigured("top_tier");

}



export const MEMBERSHIP_TIER_PRICES_USD: Record<"pr_team" | "top_tier", number> = {

  pr_team: 50,

  top_tier: 250,

};



export async function membershipPriceUsdForTier(slug: string): Promise<number> {

  const configs = await fetchMembershipTierConfigs();

  const row = configs.find((c) => c.slug === slug);

  if (row) return row.price_cents / 100;

  if (slug === "pr_team") return MEMBERSHIP_TIER_PRICES_USD.pr_team;

  if (slug === "top_tier") return MEMBERSHIP_TIER_PRICES_USD.top_tier;

  return 0;

}



export async function checkoutTierFromPriceIdAsync(priceId: string): Promise<MembershipTier | null> {

  const configs = await fetchMembershipTierConfigs();

  const match = configs.find((c) => c.stripe_price_id?.trim() === priceId);

  if (match) return match.slug as MembershipTier;



  const prTeam =

    process.env.STRIPE_PRICE_PR_TEAM_ANNUAL?.trim() ||

    process.env.STRIPE_PRICE_MEMBERSHIP_ANNUAL?.trim();

  const topTier = process.env.STRIPE_PRICE_TOP_TIER_ANNUAL?.trim();

  if (prTeam && priceId === prTeam) return "pr_team";

  if (topTier && priceId === topTier) return "top_tier";

  return null;

}



export function checkoutTierFromPriceId(priceId: string): MembershipTier | null {

  const prTeam =

    process.env.STRIPE_PRICE_PR_TEAM_ANNUAL?.trim() ||

    process.env.STRIPE_PRICE_MEMBERSHIP_ANNUAL?.trim();

  const topTier = process.env.STRIPE_PRICE_TOP_TIER_ANNUAL?.trim();

  if (prTeam && priceId === prTeam) return "pr_team";

  if (topTier && priceId === topTier) return "top_tier";

  return null;

}


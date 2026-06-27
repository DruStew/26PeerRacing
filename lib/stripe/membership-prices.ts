import type { MembershipTier } from "@/lib/membership-tiers";

import { fetchMembershipTierConfigs } from "@/lib/membership-tier-config.server";

import { ensureMembershipStripePrice } from "./ensure-membership-price";
import { getStripe } from "./server";

/** Stripe Price IDs for annual subscription tiers (auto-renew). */
export async function stripePriceIdForTierAsync(
  tier: string,
  options?: { ensure?: boolean },
): Promise<string | null> {
  const configs = await fetchMembershipTierConfigs();
  const row = configs.find((c) => c.slug === tier);
  if (!row?.is_paid) return null;

  const fromDb = row.stripe_price_id?.trim();
  const fromEnv = stripePriceIdForTierEnv(tier);
  const cached = fromDb || fromEnv || null;

  if (options?.ensure && getStripe()) {
    return ensureMembershipStripePrice(row);
  }

  return cached;
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

/** True when Stripe is configured and this paid tier can checkout (price auto-created on demand). */
export async function membershipSubscriptionConfiguredAsync(tier: string): Promise<boolean> {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return false;
  const configs = await fetchMembershipTierConfigs();
  const row = configs.find((c) => c.slug === tier && c.is_active && c.is_paid);
  return Boolean(row && row.price_cents > 0);
}

export function membershipSubscriptionConfigured(tier: "pr_team" | "top_tier"): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && stripePriceIdForTier(tier));
}

export async function anyPaidMembershipCheckoutConfiguredAsync(): Promise<boolean> {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return false;
  const configs = await fetchMembershipTierConfigs();
  return configs.some((c) => c.is_active && c.is_paid && c.price_cents > 0);
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

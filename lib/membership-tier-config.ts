export type MembershipTierConfigRow = {
  slug: string;
  display_name: string;
  description: string | null;
  price_cents: number;
  stripe_price_id: string | null;
  sort_order: number;
  rank: number;
  is_active: boolean;
  is_paid: boolean;
};

export const FALLBACK_MEMBERSHIP_TIERS: MembershipTierConfigRow[] = [
  {
    slug: "free",
    display_name: "Free",
    description: null,
    price_cents: 0,
    stripe_price_id: null,
    sort_order: 0,
    rank: 0,
    is_active: true,
    is_paid: false,
  },
  {
    slug: "pr_team",
    display_name: "PR-Team",
    description: null,
    price_cents: 5000,
    stripe_price_id: null,
    sort_order: 1,
    rank: 1,
    is_active: true,
    is_paid: true,
  },
  {
    slug: "top_tier",
    display_name: "Top Tier",
    description: null,
    price_cents: 25000,
    stripe_price_id: null,
    sort_order: 2,
    rank: 2,
    is_active: true,
    is_paid: true,
  },
];

export function formatTierPriceUsd(priceCents: number): string {
  if (priceCents <= 0) return "Free";
  return `$${(priceCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}/yr`;
}

export function tierLabelFromConfig(
  tiers: MembershipTierConfigRow[],
  slug: string,
): string {
  return tiers.find((t) => t.slug === slug)?.display_name ?? slug;
}

export function paidTiersFromConfig(
  tiers: MembershipTierConfigRow[],
): MembershipTierConfigRow[] {
  return tiers.filter((t) => t.is_active && t.is_paid);
}

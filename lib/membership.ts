import { redirect } from "next/navigation";

import type { MembershipTier } from "@/lib/membership-tiers";

/**
 * Membership gate: enforce active membership before creating event, entering race, or acting as pacer.
 * Returns redirect to /membership/renew if not active; otherwise returns membership row.
 */
export type MembershipRow = {
  user_id: string;
  status: string;
  tier?: MembershipTier | string | null;
  membership_start_at: string | null;
  membership_end_at: string | null;
  welcome_shown_at: string | null;
  renewal_count: number;
  stripe_subscription_id?: string | null;
};

export function membershipTierFromRow(m: MembershipRow | null): MembershipTier {
  const t = m?.tier;
  if (t === "pr_team" || t === "top_tier" || t === "free") return t;
  return "free";
}

/** Account is active (Free tier always; paid tiers need valid period). */
export function isMembershipActive(m: MembershipRow | null): boolean {
  if (!m || m.status !== "active") return false;
  const tier = membershipTierFromRow(m);
  if (tier === "free") return true;
  const end = m.membership_end_at ? new Date(m.membership_end_at) : null;
  return end === null || end > new Date();
}

/** Paid subscription current (any non-free tier with valid period). */
export function isPaidMembershipActive(m: MembershipRow | null): boolean {
  if (!isMembershipActive(m)) return false;
  const tier = membershipTierFromRow(m);
  return tier !== "free";
}

/**
 * If membership is not active, redirects to /membership/renew (with returnUrl).
 * If active but welcome never shown (first-time), redirects to /membership/welcome.
 */
export function requireActiveMembership(
  membership: MembershipRow | null,
  currentPath: string,
): asserts membership is MembershipRow {
  if (!membership) {
    redirect(`/membership/renew?returnUrl=${encodeURIComponent(currentPath)}`);
  }
  if (!isMembershipActive(membership)) {
    redirect(`/membership/renew?returnUrl=${encodeURIComponent(currentPath)}`);
  }
  if (membership.renewal_count === 0 && !membership.welcome_shown_at) {
    redirect(`/membership/welcome?returnUrl=${encodeURIComponent(currentPath)}`);
  }
}

export function getMembershipWelcomeRedirect(
  membership: MembershipRow | null,
  justRenewed: boolean,
): "/membership/welcome" | "/membership/renewed" | null {
  if (!membership) return null;
  if (justRenewed) return "/membership/renewed";
  if (membership.renewal_count === 0 && !membership.welcome_shown_at) return "/membership/welcome";
  return null;
}

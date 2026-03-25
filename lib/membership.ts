import { redirect } from "next/navigation";

/**
 * Membership gate: enforce active membership before creating event, entering race, or acting as pacer.
 * Returns redirect to /membership/renew if not active; otherwise returns membership row.
 * Call from server actions/pages that require membership.
 */
export type MembershipRow = {
  user_id: string;
  status: string;
  membership_start_at: string | null;
  membership_end_at: string | null;
  welcome_shown_at: string | null;
  renewal_count: number;
};

export function isMembershipActive(m: MembershipRow | null): boolean {
  if (!m || m.status !== "active") return false;
  const end = m.membership_end_at ? new Date(m.membership_end_at) : null;
  return end !== null && end > new Date();
}

/**
 * If membership is not active, redirects to /membership/renew (with returnUrl).
 * If active but welcome never shown (first-time), redirects to /membership/welcome.
 * Otherwise returns the membership. Call in server components/actions.
 */
export function requireActiveMembership(
  membership: MembershipRow | null,
  currentPath: string
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

/**
 * Check if we should redirect to welcome (first-time) or renewed (just renewed) screen.
 * Returns the redirect path or null.
 */
export function getMembershipWelcomeRedirect(
  membership: MembershipRow | null,
  justRenewed: boolean
): "/membership/welcome" | "/membership/renewed" | null {
  if (!membership) return null;
  if (justRenewed) return "/membership/renewed";
  if (membership.renewal_count === 0 && !membership.welcome_shown_at) return "/membership/welcome";
  return null;
}

// TODO: Membership billing integration point (Stripe subscription) – configurable price, default $0 for now
// TODO: Stripe subscription integration placeholder – create customer, subscription on first pay
// TODO: Payment webhooks placeholder – subscription renewed / failed / canceled

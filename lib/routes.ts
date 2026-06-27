/**
 * Default destination for runners: published events list (upcoming races).
 * Use for post-auth redirects, nav defaults, and fallbacks when no return URL is set.
 */
export const DEFAULT_PUBLIC_ROUTE = "/events";

/** Signed-in runners: registrations and withdrawals (while open). */
export const MY_ENTRIES_ROUTE = "/my-entries";

/** Signed-in runners: published race results + trophy case (badges earned). */
export const MY_RESULTS_ROUTE = "/my-results";

/** Public index of races with published official results. */
export const RACE_RESULTS_ROUTE = "/results";

/** Public membership tiers browse page. */
export const MEMBERSHIP_ROUTE = "/membership";

/** Signed-in membership account (renew, upgrade, profile). */
export const MEMBERSHIP_ACCOUNT_ROUTE = "/membership/renew";

/** Peer Racing wallet (credits, payouts, future bank transfer). */
export const WALLET_ROUTE = "/wallet";

/** Race-day kiosk entry (6-digit code from producer). */
export const KIOSK_ROUTE = "/kiosk";

/**
 * Default destination for runners: published events list (upcoming races).
 * Use for post-auth redirects, nav defaults, and fallbacks when no return URL is set.
 */
export const DEFAULT_PUBLIC_ROUTE = "/events";

/** Signed-in runners: registrations and withdrawals (while open). */
export const MY_ENTRIES_ROUTE = "/my-entries";

/** Peer Racing wallet (credits, payouts, future bank transfer). */
export const WALLET_ROUTE = "/wallet";

/** Race-day kiosk entry (6-digit code from producer). */
export const KIOSK_ROUTE = "/kiosk";

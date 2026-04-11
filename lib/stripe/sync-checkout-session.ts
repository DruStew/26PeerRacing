import "server-only";

import { getStripe } from "@/lib/stripe/server";
import { fulfillMembershipFromSession, fulfillRaceEntryFromSession } from "@/lib/stripe/fulfill";

/**
 * Ensures DB is updated if the user landed before the webhook ran.
 * Safe to call multiple times (handlers are idempotent).
 */
export async function syncCheckoutSessionForUser(sessionId: string, userId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.user_id !== userId) return;
  if (session.payment_status !== "paid") return;

  const kind = session.metadata?.checkout_kind;
  if (kind === "membership") {
    await fulfillMembershipFromSession(session);
  } else if (kind === "race_entry") {
    await fulfillRaceEntryFromSession(session);
  }
}

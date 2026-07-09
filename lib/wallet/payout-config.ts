/**
 * Wallet cash-out pricing. Spending wallet balance on race entries is always
 * free; the flat fee applies only when money leaves Peer Racing. It covers
 * Stripe Connect costs (~$2 active-account fee + 0.25% + $0.25 per payout).
 */

export const PAYOUT_FLAT_FEE_CENTS = 300;

/** Below this a $3 fee feels insulting and overhead eats the transaction. */
export const MIN_PAYOUT_CENTS = 1000;

export function payoutNetCents(amountCents: number): number {
  return amountCents - PAYOUT_FLAT_FEE_CENTS;
}

export type PayoutRequestStatus = "pending" | "paid" | "canceled" | "failed";

export type PayoutRequestRow = {
  id: string;
  user_id: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  method: "stripe" | "manual";
  status: PayoutRequestStatus;
  stripe_transfer_id: string | null;
  manual_method: string | null;
  manual_reference: string | null;
  note: string | null;
  failure_reason: string | null;
  requested_at: string;
  paid_at: string | null;
  canceled_at: string | null;
  processed_by: string | null;
};

/**
 * Estimated Stripe card processing cost (US) for a single charge grossing `grossCents`.
 * Use when reconciling external refunds / payouts to a card — not for in-app wallet credit on entry withdrawal.
 * Replace with actual Balance Transaction data when reconciling payouts.
 */
export function estimateStripeCardFeeCents(grossCents: number): number {
  if (grossCents <= 0) return 0;
  return Math.ceil(grossCents * 0.029 + 30);
}

/**
 * Gross less estimated Stripe fee — for payout/refund to card, not entry-withdrawal wallet credit.
 */
export function netWalletCreditFromGrossCents(grossCents: number): number {
  if (grossCents <= 0) return 0;
  const net = grossCents - estimateStripeCardFeeCents(grossCents);
  return net > 0 ? net : 0;
}

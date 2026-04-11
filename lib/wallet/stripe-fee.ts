/**
 * Estimated Stripe card processing cost (US) for a single charge grossing `grossCents`.
 * Used to derive net wallet credit so Peer Racing does not absorb payment fees.
 * Replace with actual Balance Transaction data when reconciling payouts.
 */
export function estimateStripeCardFeeCents(grossCents: number): number {
  if (grossCents <= 0) return 0;
  return Math.ceil(grossCents * 0.029 + 30);
}

/** Net amount credited to wallet when refunding / crediting a paid entry (gross less estimated Stripe fee). */
export function netWalletCreditFromGrossCents(grossCents: number): number {
  if (grossCents <= 0) return 0;
  const net = grossCents - estimateStripeCardFeeCents(grossCents);
  return net > 0 ? net : 0;
}

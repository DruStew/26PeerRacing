import "server-only";

import Stripe from "stripe";

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) return null;
  return new Stripe(key, { typescript: true });
}

export function stripePaymentsEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

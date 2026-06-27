import "server-only";

import type Stripe from "stripe";

import type { MembershipTierConfigRow } from "@/lib/membership-tier-config";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

import { getStripe } from "./server";

const TIER_METADATA_KEY = "peer_racing_tier_slug";

async function persistStripePriceId(slug: string, priceId: string): Promise<void> {
  const service = createServiceRoleSupabaseClient();
  if (!service) {
    console.warn("[stripe] cannot persist price id — service role not configured");
    return;
  }
  const { error } = await service
    .from("membership_tier_config")
    .update({ stripe_price_id: priceId, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) {
    console.error("[stripe] persist price id failed", slug, error.message);
  }
}

async function findProductIdForTier(stripe: Stripe, slug: string): Promise<string | null> {
  try {
    const search = await stripe.products.search({
      query: `metadata['${TIER_METADATA_KEY}']:'${slug}'`,
      limit: 1,
    });
    if (search.data[0]?.id) return search.data[0].id;
  } catch (err) {
    console.warn("[stripe] product search unavailable, listing products", err);
  }

  let startingAfter: string | undefined;
  for (let page = 0; page < 5; page++) {
    const listed = await stripe.products.list({
      limit: 100,
      active: true,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const match = listed.data.find((p) => p.metadata?.[TIER_METADATA_KEY] === slug);
    if (match?.id) return match.id;
    if (!listed.has_more) break;
    startingAfter = listed.data.at(-1)?.id;
  }
  return null;
}

async function findAnnualPriceForProduct(
  stripe: Stripe,
  productId: string,
  priceCents: number,
): Promise<string | null> {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const match = prices.data.find(
    (p) =>
      p.unit_amount === priceCents &&
      p.currency === "usd" &&
      p.recurring?.interval === "year" &&
      p.type === "recurring",
  );
  return match?.id ?? null;
}

/**
 * Returns a Stripe Price ID for a paid membership tier, creating product/price in
 * Stripe when missing and saving the price id to membership_tier_config.
 */
export async function ensureMembershipStripePrice(
  tier: Pick<MembershipTierConfigRow, "slug" | "display_name" | "price_cents" | "stripe_price_id">,
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe || !tier.price_cents || tier.price_cents <= 0) return null;

  const saved = tier.stripe_price_id?.trim();
  if (saved) {
    try {
      const price = await stripe.prices.retrieve(saved);
      if (
        price.active &&
        price.unit_amount === tier.price_cents &&
        price.recurring?.interval === "year"
      ) {
        return saved;
      }
    } catch {
      /* create or find a matching price below */
    }
  }

  let productId = await findProductIdForTier(stripe, tier.slug);
  if (!productId) {
    const product = await stripe.products.create({
      name: `Peer Racing ${tier.display_name}`,
      description: `Annual Peer Racing ${tier.display_name} membership`,
      metadata: { [TIER_METADATA_KEY]: tier.slug },
    });
    productId = product.id;
  }

  const existingPrice = await findAnnualPriceForProduct(stripe, productId, tier.price_cents);
  if (existingPrice) {
    await persistStripePriceId(tier.slug, existingPrice);
    return existingPrice;
  }

  const created = await stripe.prices.create({
    product: productId,
    unit_amount: tier.price_cents,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { [TIER_METADATA_KEY]: tier.slug },
  });

  await persistStripePriceId(tier.slug, created.id);
  return created.id;
}

/** Ensure Stripe prices exist for every active paid tier (setup / warm-up). */
export async function ensureAllMembershipStripePrices(
  tiers: MembershipTierConfigRow[],
): Promise<{ slug: string; priceId: string | null }[]> {
  const paid = tiers.filter((t) => t.is_active && t.is_paid && t.price_cents > 0);
  const results: { slug: string; priceId: string | null }[] = [];
  for (const tier of paid) {
    results.push({ slug: tier.slug, priceId: await ensureMembershipStripePrice(tier) });
  }
  return results;
}

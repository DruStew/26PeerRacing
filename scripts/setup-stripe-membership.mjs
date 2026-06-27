/**
 * Pre-create Stripe products/prices for all paid membership tiers (test or live key).
 * Usage: node --env-file=.env.local scripts/setup-stripe-membership.mjs
 */
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const TIER_METADATA_KEY = "peer_racing_tier_slug";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

if (!url || !serviceKey || !stripeKey) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const stripe = new Stripe(stripeKey, { typescript: true });

async function findProductId(slug) {
  try {
    const search = await stripe.products.search({
      query: `metadata['${TIER_METADATA_KEY}']:'${slug}'`,
      limit: 1,
    });
    if (search.data[0]?.id) return search.data[0].id;
  } catch {
    /* fall through */
  }
  const listed = await stripe.products.list({ limit: 100, active: true });
  return listed.data.find((p) => p.metadata?.[TIER_METADATA_KEY] === slug)?.id ?? null;
}

async function ensureTier(tier) {
  let productId = await findProductId(tier.slug);
  if (!productId) {
    const product = await stripe.products.create({
      name: `Peer Racing ${tier.display_name}`,
      description: `Annual Peer Racing ${tier.display_name} membership`,
      metadata: { [TIER_METADATA_KEY]: tier.slug },
    });
    productId = product.id;
    console.log(`  created product ${productId}`);
  }

  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  let priceId = prices.data.find(
    (p) =>
      p.unit_amount === tier.price_cents &&
      p.currency === "usd" &&
      p.recurring?.interval === "year",
  )?.id;

  if (!priceId) {
    const created = await stripe.prices.create({
      product: productId,
      unit_amount: tier.price_cents,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { [TIER_METADATA_KEY]: tier.slug },
    });
    priceId = created.id;
    console.log(`  created price ${priceId} ($${(tier.price_cents / 100).toFixed(2)}/yr)`);
  } else {
    console.log(`  using price ${priceId}`);
  }

  const { error } = await supabase
    .from("membership_tier_config")
    .update({ stripe_price_id: priceId, updated_at: new Date().toISOString() })
    .eq("slug", tier.slug);
  if (error) throw new Error(error.message);
  return priceId;
}

const { data: tiers, error } = await supabase
  .from("membership_tier_config")
  .select("slug,display_name,price_cents,is_paid,is_active")
  .eq("is_active", true)
  .eq("is_paid", true)
  .order("sort_order", { ascending: true });

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Stripe mode: ${stripeKey.startsWith("sk_live") ? "LIVE" : "TEST"}`);
for (const tier of tiers ?? []) {
  console.log(`\n${tier.display_name} (${tier.slug})`);
  await ensureTier(tier);
}

console.log("\nDone — membership tiers are ready for checkout.");

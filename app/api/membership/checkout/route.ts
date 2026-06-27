import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";
import { stripePriceIdForTierAsync } from "@/lib/stripe/membership-prices";
import { fetchMembershipTierConfigs } from "@/lib/membership-tier-config.server";

export const runtime = "nodejs";

/**
 * Starts Stripe Checkout for annual membership subscription (PR-Team or Top Tier).
 */
export async function POST(request: Request) {
  let body: { returnUrl?: string | null; tier?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const tierSlug = typeof body.tier === "string" ? body.tier.trim() : "pr_team";
  const configs = await fetchMembershipTierConfigs();
  const tierRow = configs.find((c) => c.slug === tierSlug && c.is_active && c.is_paid);
  if (!tierRow) {
    return NextResponse.json({ ok: false, error: "Invalid membership tier." }, { status: 400 });
  }

  const tier = tierSlug;
  const stripe = getStripe();
  const priceId = await stripePriceIdForTierAsync(tier, { ensure: true });
  if (!stripe || !priceId) {
    return NextResponse.json(
      {
        ok: false,
        error: `${tierRow.display_name} checkout is not available. Stripe is not configured on the server.`,
      },
      { status: 503 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const returnUrl =
    typeof body.returnUrl === "string" && body.returnUrl.startsWith("/") ? body.returnUrl : null;

  const successUrl =
    `${origin}/membership/renewed?session_id={CHECKOUT_SESSION_ID}` +
    (returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : "");
  const cancelUrl =
    `${origin}/membership/renew?canceled=1` +
    (returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : "");

  const { data: membership } = await supabase
    .from("memberships")
    .select("provider_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const existingCustomer = (membership as { provider_customer_id?: string | null } | null)
    ?.provider_customer_id;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: existingCustomer ?? undefined,
      customer_email: existingCustomer ? undefined : user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          user_id: user.id,
          membership_tier: tier,
          checkout_kind: "membership",
        },
      },
      metadata: {
        checkout_kind: "membership",
        membership_tier: tier,
        user_id: user.id,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe checkout failed";
    console.error("membership checkout:", message);
    return NextResponse.json({ ok: false, error: `Stripe: ${message}` }, { status: 502 });
  }

  if (!session.url) {
    return NextResponse.json({ ok: false, error: "Could not create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: session.url });
}

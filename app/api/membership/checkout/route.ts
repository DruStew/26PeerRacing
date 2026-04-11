import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

/**
 * Starts Stripe Checkout for annual membership (one-time payment per checkout).
 * Set STRIPE_PRICE_MEMBERSHIP_ANNUAL to a Price id from the Stripe Dashboard.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_MEMBERSHIP_ANNUAL ?? "";
  if (!stripe || !priceId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Membership payment is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_MEMBERSHIP_ANNUAL.",
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

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/membership/renewed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/membership/renew?canceled=1`,
    metadata: {
      checkout_kind: "membership",
      user_id: user.id,
    },
  });

  if (!session.url) {
    return NextResponse.json({ ok: false, error: "Could not create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: session.url });
}

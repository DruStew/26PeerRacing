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

  // Carry the caller's destination through checkout so new members continue to
  // race entry (or wherever they were headed) instead of dead-ending.
  let returnUrl: string | null = null;
  try {
    const body = (await request.json()) as { returnUrl?: string | null };
    if (typeof body.returnUrl === "string" && body.returnUrl.startsWith("/")) {
      returnUrl = body.returnUrl;
    }
  } catch {
    /* no body — fine */
  }
  const successUrl =
    `${origin}/membership/renewed?session_id={CHECKOUT_SESSION_ID}` +
    (returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : "");
  const cancelUrl =
    `${origin}/membership/renew?canceled=1` +
    (returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : "");

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        checkout_kind: "membership",
        user_id: user.id,
      },
    });
  } catch (e) {
    // Surface the real Stripe error (bad price id, network/TLS, etc.) instead of a blind 500.
    const message = e instanceof Error ? e.message : "Stripe checkout failed";
    console.error("membership checkout:", message);
    return NextResponse.json({ ok: false, error: `Stripe: ${message}` }, { status: 502 });
  }

  if (!session.url) {
    return NextResponse.json({ ok: false, error: "Could not create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: session.url });
}

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { fulfillMembershipFromSession, fulfillRaceEntryFromSession } from "@/lib/stripe/fulfill";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!stripe || !whSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const body = await request.text();
  const h = await headers();
  const sig = h.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, whSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const kind = session.metadata?.checkout_kind;
    if (kind === "membership") {
      await fulfillMembershipFromSession(session);
    } else if (kind === "race_entry") {
      await fulfillRaceEntryFromSession(session);
    }
  }

  return NextResponse.json({ received: true });
}

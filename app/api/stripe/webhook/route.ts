import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { fulfillMembershipFromSession, fulfillRaceEntryFromSession } from "@/lib/stripe/fulfill";
import { syncMembershipFromSubscription } from "@/lib/stripe/membership-subscription";
import { getStripe } from "@/lib/stripe/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

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

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    await syncMembershipFromSubscription(sub);
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subRef = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null })
      .subscription;
    const subId = typeof subRef === "string" ? subRef : subRef?.id;
    if (subId && stripe) {
      const sub = await stripe.subscriptions.retrieve(subId);
      await syncMembershipFromSubscription(sub);
    }
  }

  // Connect Express onboarding progress → mirror payout status into the DB so
  // the wallet page flips to "cash out" without waiting for a manual refresh.
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const service = createServiceRoleSupabaseClient();
    if (service && account.id) {
      await service
        .from("stripe_connect_accounts")
        .update({
          details_submitted: Boolean(account.details_submitted),
          payouts_enabled: Boolean(account.payouts_enabled),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", account.id);
    }
  }

  return NextResponse.json({ received: true });
}

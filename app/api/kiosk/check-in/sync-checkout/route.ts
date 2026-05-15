import { NextResponse } from "next/server";

import { authKioskForEvent } from "@/lib/kiosk/auth-kiosk-event";
import { fulfillRaceEntryFromSession } from "@/lib/stripe/fulfill";
import { getStripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

/**
 * After Stripe Checkout returns to the kiosk tablet, ensure race entries are fulfilled if the webhook is slow.
 * Kiosk is not logged in as the runner, so we cannot use syncCheckoutSessionForUser.
 */
export async function POST(request: Request) {
  let body: { eventId?: string; sessionId?: string };
  try {
    body = (await request.json()) as { eventId?: string; sessionId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!eventId || !sessionId) {
    return NextResponse.json({ ok: false, error: "Missing eventId or sessionId" }, { status: 400 });
  }

  const auth = await authKioskForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 503 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.checkout_kind !== "race_entry") {
    return NextResponse.json({ ok: false, error: "Not a race entry checkout" }, { status: 400 });
  }

  const pendingId = session.metadata?.pending_id;
  if (pendingId) {
    const { data: pend } = await auth.admin
      .from("stripe_pending_race_entries")
      .select("event_id")
      .eq("id", pendingId)
      .maybeSingle();
    if ((pend as { event_id?: string } | null)?.event_id !== eventId) {
      return NextResponse.json({ ok: false, error: "Session does not match this event" }, { status: 400 });
    }
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({ ok: true, pendingPayment: true });
  }

  const result = await fulfillRaceEntryFromSession(session);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "Fulfillment failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

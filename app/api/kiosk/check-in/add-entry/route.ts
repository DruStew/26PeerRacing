import { NextResponse } from "next/server";

import { authKioskOrPromoterForEvent } from "@/lib/kiosk/auth-kiosk-or-promoter-event";
import { isMembershipActive, membershipTierFromRow, type MembershipRow } from "@/lib/membership";
import {
  distanceTierRequirementLabel,
  tierCanEnterDistance,
} from "@/lib/membership-tiers";
import { isProfileComplete, type ProfileRow } from "@/lib/profile";
import { insertRaceEntriesForUser, type RaceEntryPendingPayload } from "@/lib/race-entry/insert-entries";
import { getStripe } from "@/lib/stripe/server";
import { sumWalletBalanceCents } from "@/lib/wallet/balance";
import { walletApplyDebitForRaceEntry, walletCreditAdjustment } from "@/lib/wallet/wallet-race-entry";

export const dynamic = "force-dynamic";

type DistanceRow = {
  id: string;
  label?: string | null;
  pr_cutoff?: string | null;
  entry_fee_cents?: number | null;
  is_peer_racing_qualifier?: boolean | null;
  allow_roll_over_from_qualifier?: boolean | null;
  allow_qualifier_split_to_roll_over_here?: boolean | null;
  allow_free_tier?: boolean | null;
  allow_pr_team_tier?: boolean | null;
  allow_top_tier?: boolean | null;
};

function computeTotalCents(
  primaryDistanceIds: string[],
  rollOverSelections: { targetDistanceId: string; sourceDistanceId: string }[],
  byId: Map<string, DistanceRow>,
): number {
  let total = 0;
  for (const id of primaryDistanceIds) {
    total += byId.get(id)?.entry_fee_cents ?? 0;
  }
  for (const r of rollOverSelections) {
    total += byId.get(r.targetDistanceId)?.entry_fee_cents ?? 0;
  }
  return total;
}

/**
 * Add a primary or carry-over entry for a runner at the kiosk (race day; ignores registration cutoff).
 * Paid fees: wallet and/or Stripe Checkout, same fulfillment as /api/events/[id]/enter.
 */
export async function POST(request: Request) {
  let body: {
    eventId?: string;
    userId?: string;
    mode?: string;
    distanceId?: string;
    sourceDistanceId?: string;
    useWallet?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const mode = body.mode === "roll_over" ? "roll_over" : "primary";
  const distanceId = typeof body.distanceId === "string" ? body.distanceId.trim() : "";
  const sourceDistanceId =
    typeof body.sourceDistanceId === "string" ? body.sourceDistanceId.trim() : "";
  const useWallet = body.useWallet === true;

  if (!eventId || !userId || !distanceId) {
    return NextResponse.json({ ok: false, error: "Missing eventId, userId, or distanceId" }, { status: 400 });
  }

  const auth = await authKioskOrPromoterForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  const admin = auth.admin;

  const { data: membership } = await admin
    .from("memberships")
    .select("user_id,status,tier,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (!isMembershipActive(membership as MembershipRow | null)) {
    return NextResponse.json(
      { ok: false, error: "Runner needs an active Peer Racing membership to add a race." },
      { status: 403 },
    );
  }
  const memberTier = membershipTierFromRow(membership as MembershipRow);

  const { data: profile } = await admin
    .from("profiles")
    .select("id,first_name,last_name,dob,sex,active_or_retired_military,phone,email,pr_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  if (!isProfileComplete(profile as ProfileRow | null)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Runner must complete their profile (including active or retired military) before adding an entry.",
      },
      { status: 403 },
    );
  }

  const { data: authUser } = await admin.auth.admin.getUserById(userId);

  const { data: event } = await admin.from("events").select("id,pr_cutoff,name").eq("id", eventId).single();
  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
  }

  const { data: allDistancesRaw } = await admin
    .from("distances")
    .select(
      "id,label,pr_cutoff,entry_fee_cents,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here,allow_free_tier,allow_pr_team_tier,allow_top_tier",
    )
    .eq("event_id", eventId);

  const allDistances = (allDistancesRaw ?? []) as DistanceRow[];
  const distById = new Map(allDistances.map((d) => [d.id, d]));

  if (!distById.has(distanceId)) {
    return NextResponse.json({ ok: false, error: "Invalid distance for this event" }, { status: 400 });
  }

  const targetDist = distById.get(distanceId)!;
  if (!tierCanEnterDistance(memberTier, targetDist)) {
    return NextResponse.json(
      {
        ok: false,
        error: `${targetDist.label ?? "Race"}: ${distanceTierRequirementLabel(targetDist)}.`,
      },
      { status: 403 },
    );
  }

  const qualifierId = allDistances.find(
    (d) => d.is_peer_racing_qualifier && d.allow_roll_over_from_qualifier,
  )?.id;
  const allowedRollOverTargets = new Set(
    allDistances.filter((d) => d.allow_qualifier_split_to_roll_over_here).map((d) => d.id),
  );

  let primaryDistanceIds: string[] = [];
  let rollOverSelections: { targetDistanceId: string; sourceDistanceId: string }[] = [];

  if (mode === "roll_over" && !qualifierId) {
    return NextResponse.json(
      { ok: false, error: "This event does not have a qualifier Carry-Over configured." },
      { status: 400 },
    );
  }

  if (mode === "primary") {
    const { data: exists } = await admin
      .from("entries")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .eq("distance_id", distanceId)
      .maybeSingle();
    if (exists) {
      return NextResponse.json({ ok: false, error: "Runner is already entered in this race." }, { status: 409 });
    }
    primaryDistanceIds = [distanceId];
  } else {
    if (!sourceDistanceId || sourceDistanceId !== qualifierId) {
      return NextResponse.json({ ok: false, error: "Invalid Carry-Over source distance." }, { status: 400 });
    }
    if (!allowedRollOverTargets.has(distanceId)) {
      return NextResponse.json({ ok: false, error: "This race does not accept Carry-Over from the qualifier." }, { status: 400 });
    }
    const { data: qualPrimary } = await admin
      .from("entries")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .eq("distance_id", qualifierId)
      .eq("entry_type", "primary")
      .maybeSingle();
    if (!qualPrimary) {
      return NextResponse.json(
        { ok: false, error: "Runner needs a primary entry in the Peer Racing Qualifier first." },
        { status: 400 },
      );
    }
    const { data: existsTgt } = await admin
      .from("entries")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .eq("distance_id", distanceId)
      .maybeSingle();
    if (existsTgt) {
      return NextResponse.json({ ok: false, error: "Runner is already entered in this race." }, { status: 409 });
    }
    rollOverSelections = [{ targetDistanceId: distanceId, sourceDistanceId }];
  }

  const totalCents = computeTotalCents(primaryDistanceIds, rollOverSelections, distById);
  const bib = String((profile as { pr_id?: string | null }).pr_id ?? "").trim() || null;

  const walletBalance = await sumWalletBalanceCents(admin, userId);
  const walletApplied =
    useWallet && walletBalance > 0 && totalCents > 0 ? Math.min(walletBalance, totalCents) : 0;
  const cardDueCents = totalCents - walletApplied;

  const eventNameDisplay = (event as { name?: string | null }).name ?? "Race";
  const stripe = getStripe();

  if (totalCents > 0 && cardDueCents === 0) {
    const debit = await walletApplyDebitForRaceEntry(admin, {
      userId,
      amountCents: totalCents,
      eventId,
      eventName: eventNameDisplay,
      metadata: { kiosk_check_in: true },
    });
    if (!debit.ok) {
      return NextResponse.json({ ok: false, error: debit.message }, { status: 400 });
    }

    const paidAtIso = new Date().toISOString();
    const paidInsert = await insertRaceEntriesForUser(admin, {
      eventId,
      userId,
      profile: profile ?? {},
      userPhoneFallback: authUser.user?.phone ?? "",
      userEmailFallback: authUser.user?.email ?? "",
      event,
      allDistances,
      primaryDistanceIds,
      rollOverSelections,
      qualifierId: qualifierId ?? null,
      allowedRollOverTargets,
      bib,
      entryKind: "paid",
      paidAtIso,
    });

    if (!paidInsert.ok) {
      await walletCreditAdjustment(admin, {
        userId,
        amountCents: totalCents,
        label: "Reversal: kiosk entry could not be created",
        metadata: { event_id: eventId },
      });
      return NextResponse.json({ ok: false, error: paidInsert.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, kind: "wallet_paid" });
  }

  if (totalCents > 0 && cardDueCents > 0 && !stripe) {
    return NextResponse.json(
      { ok: false, error: "Card payment is not configured (Stripe). Use wallet only or configure Stripe." },
      { status: 503 },
    );
  }

  if (stripe && totalCents > 0 && cardDueCents > 0) {
    const payload: RaceEntryPendingPayload = {
      primaryDistanceIds,
      rollOverSelections,
      bib,
      walletAppliedCents: walletApplied,
    };

    const { data: pending, error: pendErr } = await admin
      .from("stripe_pending_race_entries")
      .insert({
        user_id: userId,
        event_id: eventId,
        payload,
      })
      .select("id")
      .single();

    if (pendErr || !pending) {
      return NextResponse.json({ ok: false, error: pendErr?.message ?? "Could not start checkout" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: authUser.user?.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${eventNameDisplay} — kiosk entry` },
            unit_amount: cardDueCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/events/${eventId}/check-in?checkout=success&session_id={CHECKOUT_SESSION_ID}&kiosk_user=${encodeURIComponent(userId)}`,
      cancel_url: `${origin}/events/${eventId}/check-in?canceled=1&kiosk_user=${encodeURIComponent(userId)}`,
      metadata: {
        checkout_kind: "race_entry",
        pending_id: (pending as { id: string }).id,
        user_id: userId,
      },
    });

    if (!session.url) {
      await admin.from("stripe_pending_race_entries").delete().eq("id", (pending as { id: string }).id);
      return NextResponse.json({ ok: false, error: "Checkout URL missing" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, kind: "stripe", url: session.url });
  }

  const insertResult = await insertRaceEntriesForUser(admin, {
    eventId,
    userId,
    profile: profile ?? {},
    userPhoneFallback: authUser.user?.phone ?? "",
    userEmailFallback: authUser.user?.email ?? "",
    event,
    allDistances,
    primaryDistanceIds,
    rollOverSelections,
    qualifierId: qualifierId ?? null,
    allowedRollOverTargets,
    bib,
    entryKind: "free",
    paidAtIso: null,
  });

  if (!insertResult.ok) {
    return NextResponse.json({ ok: false, error: insertResult.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, kind: "free" });
}

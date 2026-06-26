import { NextResponse } from "next/server";

import { insertRaceEntriesForUser, type RaceEntryPendingPayload } from "@/lib/race-entry/insert-entries";
import { isProfileComplete, type ProfileRow } from "@/lib/profile";
import { getStripe } from "@/lib/stripe/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isMembershipActive, membershipTierFromRow, type MembershipRow } from "@/lib/membership";
import {
  distanceTierRequirementLabel,
  tierCanEnterDistance,
  type DistanceTierAccess,
} from "@/lib/membership-tiers";
import { sumWalletBalanceCents } from "@/lib/wallet/balance";
import { walletApplyDebitForRaceEntry, walletCreditAdjustment } from "@/lib/wallet/wallet-race-entry";

type DistanceRow = {
  id: string;
  pr_cutoff?: string | null;
  results_published_at?: string | null;
  label?: string | null;
  entry_fee_cents?: number | null;
  is_peer_racing_qualifier?: boolean;
  allow_roll_over_from_qualifier?: boolean;
  allow_qualifier_split_to_roll_over_here?: boolean;
} & DistanceTierAccess;

function computeEntryTotalCents(
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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;
  const formData = await request.formData();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "You must be signed in to enter a race" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,dob,sex,active_or_retired_military,phone,email")
    .eq("id", user.id)
    .single();

  if (!isProfileComplete(profile as ProfileRow | null)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Complete your profile before entering, including sex, active or retired military, and a cell phone with at least 10 digits.",
      },
      { status: 403 },
    );
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id,status,tier,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
    .eq("user_id", user.id)
    .single();
  if (!isMembershipActive(membership as MembershipRow | null)) {
    return NextResponse.json(
      { ok: false, error: "Active membership required", redirect: "/membership/renew" },
      { status: 403 },
    );
  }
  const memberTier = membershipTierFromRow(membership as MembershipRow);

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,pr_cutoff,promoter_id,name")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
  }

  const eventCutoff = event.pr_cutoff ? new Date(event.pr_cutoff) : null;
  const defaultCutoff = eventCutoff && !Number.isNaN(eventCutoff.getTime()) ? eventCutoff : null;

  const primaryDistanceIds = formData
    .getAll("enter_distance")
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (primaryDistanceIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Select at least one race to enter" }, { status: 400 });
  }

  const { data: allDistancesRaw } = await supabase
    .from("distances")
    .select(
      "id,label,pr_cutoff,results_published_at,entry_fee_cents,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here,allow_free_tier,allow_pr_team_tier,allow_top_tier",
    )
    .eq("event_id", eventId);

  const allDistances = (allDistancesRaw ?? []) as DistanceRow[];
  const distById = new Map(allDistances.map((d) => [d.id, d]));

  const distances = allDistances.filter((d) => primaryDistanceIds.includes(d.id));
  const validDistanceIds = new Set(allDistances.map((d) => d.id));
  const qualifierId = allDistances.find(
    (d) => d.is_peer_racing_qualifier && d.allow_roll_over_from_qualifier,
  )?.id;
  const allowedRollOverTargets = new Set(
    allDistances.filter((d) => d.allow_qualifier_split_to_roll_over_here).map((d) => d.id),
  );

  const rollOverSelections: { targetDistanceId: string; sourceDistanceId: string }[] = [];
  const rollOverActiveTargets = new Set<string>();
  if (qualifierId) {
    for (const [key, value] of formData.entries()) {
      if (typeof value !== "string" || value !== "1") continue;
      const m = key.match(/^roll_over_(.+)_from_(.+)$/);
      if (!m) continue;
      const [, targetId, sourceId] = m;
      if (sourceId === qualifierId && allowedRollOverTargets.has(targetId)) {
        rollOverActiveTargets.add(targetId);
        rollOverSelections.push({ targetDistanceId: targetId, sourceDistanceId: sourceId });
      }
    }
    for (const tid of rollOverActiveTargets) {
      if (primaryDistanceIds.includes(tid)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "You cannot enter a race as a primary selection if you are using a qualifier Carry-Over into that same race. Choose one or the other.",
          },
          { status: 400 },
        );
      }
    }
    if (rollOverActiveTargets.size > 0 && !primaryDistanceIds.includes(qualifierId)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Select the Peer Racing Qualifier as a primary entry to use Carry-Over options.",
        },
        { status: 400 },
      );
    }
  }

  const distanceCutoffs = new Map(
    allDistances.map((d) => [d.id, d.pr_cutoff ? new Date(d.pr_cutoff) : null]),
  );

  const now = new Date();
  for (const did of primaryDistanceIds) {
    if (!validDistanceIds.has(did)) {
      return NextResponse.json({ ok: false, error: "Invalid distance for this event" }, { status: 400 });
    }
    // Publishing results closes a distance for good, regardless of the entry deadline.
    if (distById.get(did)?.results_published_at) {
      const closedUrl = new URL(`/events/${eventId}/entry-closed`, request.url);
      return NextResponse.redirect(closedUrl, 303);
    }
    const cutoff = distanceCutoffs.get(did) ?? defaultCutoff;
    if (cutoff != null && !Number.isNaN(cutoff.getTime()) && now > cutoff) {
      const closedUrl = new URL(`/events/${eventId}/entry-closed`, request.url);
      return NextResponse.redirect(closedUrl, 303);
    }
  }

  const tierBlockedIds = [
    ...primaryDistanceIds,
    ...rollOverSelections.map((r) => r.targetDistanceId),
  ];
  for (const did of tierBlockedIds) {
    const dist = distById.get(did);
    if (!dist) continue;
    if (!tierCanEnterDistance(memberTier, dist)) {
      const label = dist.label?.trim() || "This race";
      return NextResponse.json(
        {
          ok: false,
          error: `${label}: ${distanceTierRequirementLabel(dist)}.`,
          redirect: "/membership/renew",
        },
        { status: 403 },
      );
    }
  }

  const { data: existingEntries } = await supabase
    .from("entries")
    .select("distance_id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .in("distance_id", primaryDistanceIds);

  if (existingEntries && existingEntries.length > 0) {
    const enterUrl = new URL(`/events/${eventId}/enter`, request.url);
    enterUrl.searchParams.set("error", "already_entered");
    return NextResponse.redirect(enterUrl, { status: 303 });
  }

  const phoneVal =
    (profile as { phone?: string })?.phone?.trim() || user.phone || user.email || "";
  const bib = String(formData.get("bib") ?? "").trim() || null;

  const totalCents = computeEntryTotalCents(primaryDistanceIds, rollOverSelections, distById);
  const stripe = getStripe();

  const useWallet = formData.get("use_wallet") === "1";
  const walletBalance = await sumWalletBalanceCents(supabase, user.id);
  const walletApplied =
    useWallet && walletBalance > 0 && totalCents > 0 ? Math.min(walletBalance, totalCents) : 0;
  const cardDueCents = totalCents - walletApplied;

  const eventNameDisplay = (event as { name?: string | null }).name ?? "Race";

  if (totalCents > 0 && cardDueCents === 0) {
    const admin = createServiceRoleSupabaseClient();
    if (!admin) {
      return NextResponse.json(
        {
          ok: false,
          error: "Server wallet payment is not configured (SUPABASE_SERVICE_ROLE_KEY).",
        },
        { status: 503 },
      );
    }

    const debit = await walletApplyDebitForRaceEntry(admin, {
      userId: user.id,
      amountCents: totalCents,
      eventId,
      eventName: eventNameDisplay,
    });
    if (!debit.ok) {
      return NextResponse.json({ ok: false, error: debit.message }, { status: 400 });
    }

    const paidAtIso = new Date().toISOString();
    const paidInsert = await insertRaceEntriesForUser(supabase, {
      eventId,
      userId: user.id,
      profile: profile ?? {},
      userPhoneFallback: user.phone ?? "",
      userEmailFallback: user.email ?? "",
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
        userId: user.id,
        amountCents: totalCents,
        label: "Reversal: race entry could not be created",
        metadata: { event_id: eventId },
      });
      return NextResponse.json({ ok: false, error: paidInsert.error }, { status: 400 });
    }

    const redirectPaid = new URL(`/events/${eventId}/enter`, request.url);
    redirectPaid.searchParams.set("success", "1");
    redirectPaid.searchParams.set("created_at", paidInsert.firstCreatedAt);
    return NextResponse.redirect(redirectPaid, { status: 303 });
  }

  if (totalCents > 0 && cardDueCents > 0 && !stripe) {
    return NextResponse.json(
      {
        ok: false,
        error: "Card payment isn’t set up (Stripe keys), or your wallet doesn’t cover the full fee.",
      },
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

    const { data: pending, error: pendErr } = await supabase
      .from("stripe_pending_race_entries")
      .insert({
        user_id: user.id,
        event_id: eventId,
        payload,
      })
      .select("id")
      .single();

    if (pendErr || !pending) {
      return NextResponse.json(
        { ok: false, error: pendErr?.message ?? "Could not start checkout" },
        { status: 400 },
      );
    }

    const origin = new URL(request.url).origin;
    const line_items: {
      price_data: {
        currency: "usd";
        product_data: { name: string };
        unit_amount: number;
      };
      quantity: number;
    }[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${eventNameDisplay} — entry`,
          },
          unit_amount: cardDueCents,
        },
        quantity: 1,
      },
    ];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      line_items,
      success_url: `${origin}/events/${eventId}/enter?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/events/${eventId}/enter?canceled=1`,
      metadata: {
        checkout_kind: "race_entry",
        pending_id: pending.id,
        user_id: user.id,
      },
    });

    if (!session.url) {
      await supabase.from("stripe_pending_race_entries").delete().eq("id", pending.id);
      return NextResponse.json({ ok: false, error: "Checkout URL missing" }, { status: 500 });
    }

    return NextResponse.redirect(session.url, 303);
  }

  const insertResult = await insertRaceEntriesForUser(supabase, {
    eventId,
    userId: user.id,
    profile: profile ?? {},
    userPhoneFallback: user.phone ?? "",
    userEmailFallback: user.email ?? "",
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

  const redirectUrl = new URL(`/events/${eventId}/enter`, request.url);
  redirectUrl.searchParams.set("success", "1");
  redirectUrl.searchParams.set("created_at", insertResult.firstCreatedAt);

  return NextResponse.redirect(redirectUrl, { status: 303 });
}

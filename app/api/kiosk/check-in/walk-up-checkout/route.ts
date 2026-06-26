import { NextResponse } from "next/server";

import { authKioskForEvent } from "@/lib/kiosk/auth-kiosk-event";
import { kioskAutoCheckInWalkUpRunner } from "@/lib/kiosk/walk-up-auto-check-in";
import { isMembershipActive, membershipTierFromRow, type MembershipRow } from "@/lib/membership";
import { fetchMembershipTierConfigs } from "@/lib/membership-tier-config.server";
import {
  distanceTierRequirementLabel,
  minimumPaidTierForDistance,
  tierCanEnterDistance,
  tierRank,
  type MembershipTier,
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

function computeWalkUpMembershipUpgrade(
  memberTier: MembershipTier,
  distances: DistanceRow[],
  tierConfigs: Awaited<ReturnType<typeof fetchMembershipTierConfigs>>,
): { tier: string | null; priceCents: number } {
  let neededTier: MembershipTier | null = null;
  for (const d of distances) {
    if (tierCanEnterDistance(memberTier, d)) continue;
    const req = minimumPaidTierForDistance(d) ?? "top_tier";
    if (!neededTier || tierRank(req) > tierRank(neededTier)) neededTier = req;
  }
  if (!neededTier || tierRank(memberTier) >= tierRank(neededTier)) {
    return { tier: null, priceCents: 0 };
  }
  const tierRow = tierConfigs.find((t) => t.slug === neededTier && t.is_active);
  const priceCents = tierRow?.price_cents ?? 0;
  if (priceCents <= 0 && tierRow?.is_paid) {
    return { tier: neededTier, priceCents: -1 };
  }
  return { tier: neededTier, priceCents };
}

/**
 * Walk-up registration checkout: membership upgrade (if required) + race entries in one Stripe payment.
 */
export async function POST(request: Request) {
  let body: {
    eventId?: string;
    userId?: string;
    distanceId?: string;
    primaryDistanceIds?: string[];
    rollOverSelections?: { targetDistanceId: string; sourceDistanceId: string }[];
    useWallet?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const useWallet = body.useWallet !== false;

  let primaryDistanceIds = Array.isArray(body.primaryDistanceIds)
    ? body.primaryDistanceIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (primaryDistanceIds.length === 0 && typeof body.distanceId === "string" && body.distanceId.trim()) {
    primaryDistanceIds = [body.distanceId.trim()];
  }

  const rollOverSelections = Array.isArray(body.rollOverSelections)
    ? body.rollOverSelections.filter(
        (r) =>
          r &&
          typeof r.targetDistanceId === "string" &&
          r.targetDistanceId.length > 0 &&
          typeof r.sourceDistanceId === "string" &&
          r.sourceDistanceId.length > 0,
      )
    : [];

  if (!eventId || !userId) {
    return NextResponse.json({ ok: false, error: "Missing eventId or userId" }, { status: 400 });
  }

  if (primaryDistanceIds.length === 0 && rollOverSelections.length === 0) {
    return NextResponse.json({ ok: false, error: "Select at least one race to enter" }, { status: 400 });
  }

  const auth = await authKioskForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  const admin = auth.admin;

  const { data: profile } = await admin
    .from("profiles")
    .select("id,first_name,last_name,dob,sex,active_or_retired_military,phone,email,pr_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !isProfileComplete(profile as ProfileRow)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Complete the runner profile first (name, email, phone, DOB, sex, military status). Use Create new PR member.",
      },
      { status: 403 },
    );
  }

  const { data: membership } = await admin
    .from("memberships")
    .select("user_id,status,tier,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (!isMembershipActive(membership as MembershipRow | null)) {
    return NextResponse.json(
      { ok: false, error: "Runner needs an active Peer Racing membership." },
      { status: 403 },
    );
  }

  const memberTier = membershipTierFromRow(membership as MembershipRow);

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
  const validDistanceIds = new Set(allDistances.map((d) => d.id));

  for (const id of primaryDistanceIds) {
    if (!validDistanceIds.has(id)) {
      return NextResponse.json({ ok: false, error: "Invalid distance for this event" }, { status: 400 });
    }
  }

  const qualifierId = allDistances.find(
    (d) => d.is_peer_racing_qualifier && d.allow_roll_over_from_qualifier,
  )?.id;
  const allowedRollOverTargets = new Set(
    allDistances.filter((d) => d.allow_qualifier_split_to_roll_over_here).map((d) => d.id),
  );

  const rollOverActiveTargets = new Set<string>();
  if (qualifierId) {
    for (const r of rollOverSelections) {
      if (r.sourceDistanceId !== qualifierId || !allowedRollOverTargets.has(r.targetDistanceId)) {
        return NextResponse.json({ ok: false, error: "Invalid Carry-Over selection." }, { status: 400 });
      }
      rollOverActiveTargets.add(r.targetDistanceId);
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
          error: "Select the Peer Racing Qualifier as a primary entry to use Carry-Over options.",
        },
        { status: 400 },
      );
    }
  } else if (rollOverSelections.length > 0) {
    return NextResponse.json(
      { ok: false, error: "This event does not have a qualifier Carry-Over configured." },
      { status: 400 },
    );
  }

  const allSelectedIds = [...primaryDistanceIds, ...rollOverSelections.map((r) => r.targetDistanceId)];
  const { data: existingEntries } = await admin
    .from("entries")
    .select("distance_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .in("distance_id", allSelectedIds);

  if (existingEntries && existingEntries.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Runner is already entered in one or more of those races." },
      { status: 409 },
    );
  }

  const tierCheckDistances = allSelectedIds
    .map((id) => distById.get(id))
    .filter((d): d is DistanceRow => Boolean(d));

  const tierConfigs = await fetchMembershipTierConfigs();
  const upgrade = computeWalkUpMembershipUpgrade(memberTier, tierCheckDistances, tierConfigs);

  if (upgrade.priceCents < 0 && upgrade.tier) {
    const sample = tierCheckDistances.find((d) => !tierCanEnterDistance(memberTier, d));
    return NextResponse.json(
      {
        ok: false,
        error: `${sample ? distanceTierRequirementLabel(sample) : "Membership upgrade required"}. Set membership prices in Admin → Memberships.`,
      },
      { status: 503 },
    );
  }

  const membershipCents = upgrade.priceCents;
  const membershipTierSlug = upgrade.tier;
  const entryCents = computeEntryTotalCents(primaryDistanceIds, rollOverSelections, distById);
  const totalCents = membershipCents + entryCents;
  const bib = String((profile as { pr_id?: string | null }).pr_id ?? "").trim() || null;

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const eventNameDisplay = (event as { name?: string | null }).name ?? "Race";

  async function applyMembershipUpgradeIfNeeded() {
    if (!membershipTierSlug) return;
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    await admin
      .from("memberships")
      .update({
        tier: membershipTierSlug,
        status: "active",
        membership_end_at: end.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  if (totalCents === 0) {
    await applyMembershipUpgradeIfNeeded();

    const insertResult = await insertRaceEntriesForUser(admin, {
      eventId,
      userId,
      profile,
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

    const checkIn = await kioskAutoCheckInWalkUpRunner(admin, eventId, userId);
    return NextResponse.json({ ok: true, kind: "free", walkUpAutoCheckedIn: true, checkedInCount: checkIn.checkedInCount });
  }

  const walletBalance = await sumWalletBalanceCents(admin, userId);
  const walletApplied = useWallet && walletBalance > 0 ? Math.min(walletBalance, totalCents) : 0;
  const cardDueCents = totalCents - walletApplied;

  const stripe = getStripe();
  if (cardDueCents > 0 && !stripe) {
    return NextResponse.json(
      { ok: false, error: "Card payment is not configured (Stripe)." },
      { status: 503 },
    );
  }

  if (cardDueCents === 0 && walletApplied > 0) {
    const debit = await walletApplyDebitForRaceEntry(admin, {
      userId,
      amountCents: walletApplied,
      eventId,
      eventName: eventNameDisplay,
      metadata: { kiosk_walk_up: true },
    });
    if (!debit.ok) {
      return NextResponse.json({ ok: false, error: debit.message }, { status: 400 });
    }

    await applyMembershipUpgradeIfNeeded();

    const paidAtIso = new Date().toISOString();
    const paidInsert = await insertRaceEntriesForUser(admin, {
      eventId,
      userId,
      profile,
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
        amountCents: walletApplied,
        label: "Reversal: walk-up entry could not be created",
        metadata: { event_id: eventId },
      });
      return NextResponse.json({ ok: false, error: paidInsert.error }, { status: 400 });
    }

    const checkIn = await kioskAutoCheckInWalkUpRunner(admin, eventId, userId);
    return NextResponse.json({
      ok: true,
      kind: "wallet_paid",
      walkUpAutoCheckedIn: true,
      checkedInCount: checkIn.checkedInCount,
    });
  }

  const payload: RaceEntryPendingPayload = {
    primaryDistanceIds,
    rollOverSelections,
    bib,
    walletAppliedCents: walletApplied,
    kioskWalkUpMembership:
      membershipTierSlug && membershipCents > 0
        ? { tier: membershipTierSlug, priceCents: membershipCents }
        : undefined,
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

  const lineItems = [
    {
      price_data: {
        currency: "usd" as const,
        product_data: {
          name:
            membershipCents > 0 && entryCents > 0
              ? `${eventNameDisplay} — membership + race entry`
              : membershipCents > 0
                ? `Peer Racing membership — ${eventNameDisplay}`
                : `${eventNameDisplay} — race entry`,
        },
        unit_amount: cardDueCents,
      },
      quantity: 1,
    },
  ];

  const origin = new URL(request.url).origin;
  const session = await stripe!.checkout.sessions.create({
    mode: "payment",
    customer_email: authUser.user?.email ?? (profile as { email?: string }).email ?? undefined,
    line_items: lineItems,
    success_url: `${origin}/events/${eventId}/check-in?checkout=success&session_id={CHECKOUT_SESSION_ID}&kiosk_user=${encodeURIComponent(userId)}&walk_up=1`,
    cancel_url: `${origin}/events/${eventId}/check-in?canceled=1&kiosk_user=${encodeURIComponent(userId)}`,
    metadata: {
      checkout_kind: "race_entry",
      pending_id: (pending as { id: string }).id,
      user_id: userId,
      kiosk_walk_up: "1",
    },
  });

  if (!session.url) {
    await admin.from("stripe_pending_race_entries").delete().eq("id", (pending as { id: string }).id);
    return NextResponse.json({ ok: false, error: "Checkout URL missing" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    kind: "stripe",
    url: session.url,
    summary: {
      membershipCents,
      entryCents,
      totalCents,
      walletApplied,
      cardDueCents,
    },
  });
}

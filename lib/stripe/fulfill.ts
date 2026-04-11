import type Stripe from "stripe";

import { insertRaceEntriesForUser, type RaceEntryPendingPayload } from "@/lib/race-entry/insert-entries";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { getStripe } from "@/lib/stripe/server";

/**
 * Idempotent: extend membership after successful Checkout (membership checkout).
 */
export async function fulfillMembershipFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.user_id;
  if (!userId || session.metadata?.checkout_kind !== "membership") return;
  if (session.payment_status !== "paid") return;

  const service = createServiceRoleSupabaseClient();
  if (!service) return;

  const { data: existing } = await service
    .from("memberships")
    .select("stripe_last_checkout_session_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.stripe_last_checkout_session_id === session.id) {
    return;
  }

  const now = new Date();
  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  const { data: current } = await service
    .from("memberships")
    .select("renewal_count,membership_end_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!current) {
    await service.from("memberships").insert({
      user_id: userId,
      status: "active",
      membership_start_at: now.toISOString(),
      membership_end_at: oneYearLater.toISOString(),
      renewal_count: 0,
      updated_at: now.toISOString(),
      provider: "stripe",
      provider_customer_id: customerId,
      stripe_last_checkout_session_id: session.id,
    });
    return;
  }

  const nextCount = (current.renewal_count ?? 0) + 1;
  await service
    .from("memberships")
    .update({
      status: "active",
      membership_end_at: oneYearLater.toISOString(),
      renewal_count: nextCount,
      updated_at: now.toISOString(),
      provider: "stripe",
      provider_customer_id: customerId,
      stripe_last_checkout_session_id: session.id,
    })
    .eq("user_id", userId);
}

/**
 * Creates entries from a paid race checkout (webhook or verify retry).
 */
export async function fulfillRaceEntryFromSession(session: Stripe.Checkout.Session): Promise<{
  ok: boolean;
  error?: string;
}> {
  const pendingId = session.metadata?.pending_id;
  const kind = session.metadata?.checkout_kind;
  if (!pendingId || kind !== "race_entry") return { ok: true };
  if (session.payment_status !== "paid") return { ok: false, error: "Not paid" };

  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe not configured" };

  const service = createServiceRoleSupabaseClient();
  if (!service) return { ok: false, error: "Service client unavailable" };

  const { data: pending, error: pErr } = await service
    .from("stripe_pending_race_entries")
    .select("id,user_id,event_id,payload,fulfilled_at")
    .eq("id", pendingId)
    .maybeSingle();

  if (pErr || !pending) return { ok: false, error: pErr?.message ?? "Pending row missing" };
  if (pending.fulfilled_at) return { ok: true };

  const userId = pending.user_id as string;
  const eventId = pending.event_id as string;
  if (session.metadata?.user_id !== userId) return { ok: false, error: "User mismatch" };

  const payload = pending.payload as RaceEntryPendingPayload;

  const { data: profile } = await service
    .from("profiles")
    .select("first_name,last_name,dob,sex,phone,email")
    .eq("id", userId)
    .single();

  const { data: authUser } = await service.auth.admin.getUserById(userId);

  const { data: event } = await service
    .from("events")
    .select("id,pr_cutoff")
    .eq("id", eventId)
    .single();

  if (!event) return { ok: false, error: "Event missing" };

  const { data: allDistances } = await service
    .from("distances")
    .select(
      "id,pr_cutoff,entry_fee_cents,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here",
    )
    .eq("event_id", eventId);

  const distList = allDistances ?? [];
  const qualifierId = distList.find(
    (d) =>
      (d as { is_peer_racing_qualifier?: boolean }).is_peer_racing_qualifier &&
      (d as { allow_roll_over_from_qualifier?: boolean }).allow_roll_over_from_qualifier,
  )?.id as string | undefined;

  const allowedRollOverTargets = new Set(
    distList
      .filter((d) => (d as { allow_qualifier_split_to_roll_over_here?: boolean }).allow_qualifier_split_to_roll_over_here)
      .map((d) => d.id as string),
  );

  const paidAt = new Date().toISOString();
  const result = await insertRaceEntriesForUser(service, {
    eventId,
    userId,
    profile: profile ?? {},
    userPhoneFallback: authUser.user?.phone ?? "",
    userEmailFallback: authUser.user?.email ?? "",
    event,
    allDistances: distList,
    primaryDistanceIds: payload.primaryDistanceIds,
    rollOverSelections: payload.rollOverSelections,
    qualifierId: qualifierId ?? null,
    allowedRollOverTargets,
    bib: payload.bib,
    entryKind: "paid",
    paidAtIso: paidAt,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await service
    .from("stripe_pending_race_entries")
    .update({ fulfilled_at: paidAt })
    .eq("id", pendingId);

  return { ok: true };
}

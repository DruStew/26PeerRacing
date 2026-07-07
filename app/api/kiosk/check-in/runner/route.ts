import { NextResponse } from "next/server";

import { authKioskOrPromoterForEvent } from "@/lib/kiosk/auth-kiosk-or-promoter-event";
import { loadDemoRunnerContext } from "@/lib/kiosk/load-demo-runner";
import { loadEventIsDemo } from "@/lib/demo/event";
import { filterEntriesForProfile } from "@/lib/kiosk/match-profile-entries";
import { formatDistanceDisplay } from "@/lib/distance-display";
import { isMembershipActive, membershipTierFromRow, type MembershipRow } from "@/lib/membership";
import { tierLabelFromConfig } from "@/lib/membership-tier-config";
import { fetchMembershipTierConfigs } from "@/lib/membership-tier-config.server";
import { isProfileComplete, type ProfileRow } from "@/lib/profile";
import { sumWalletBalanceCents } from "@/lib/wallet/balance";

export const dynamic = "force-dynamic";

type DistanceRow = {
  id: string;
  label: string | null;
  race_name?: string | null;
  gun_time?: string | null;
  results_published_at?: string | null;
  sort_order?: number | null;
  entry_fee_cents: number | null;
  is_peer_racing_qualifier?: boolean | null;
  allow_roll_over_from_qualifier?: boolean | null;
  allow_qualifier_split_to_roll_over_here?: boolean | null;
  allow_free_tier?: boolean | null;
  allow_pr_team_tier?: boolean | null;
  allow_top_tier?: boolean | null;
};

function distanceLabel(d: Pick<DistanceRow, "label" | "race_name">): string {
  return formatDistanceDisplay({ label: d.label ?? "Race", race_name: d.race_name });
}

/**
 * Full runner context for check-in: profile, all entries for this event, upsell distances, carry-over options.
 */
export async function POST(request: Request) {
  let body: { eventId?: string; userId?: string; entryId?: string };
  try {
    body = (await request.json()) as { eventId?: string; userId?: string; entryId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  let userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";

  const auth = await authKioskOrPromoterForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  const isDemoEvent = await loadEventIsDemo(auth.admin, eventId);
  if (isDemoEvent && entryId) {
    const demoPayload = await loadDemoRunnerContext(auth.admin, eventId, entryId);
    if (demoPayload) {
      return NextResponse.json(demoPayload);
    }
  }

  // Tapped row: resolve runner from the entry id first so we never trust a stale/wrong user_id from search alone.
  if (entryId) {
    const { data: ent } = await auth.admin
      .from("entries")
      .select("user_id,email")
      .eq("id", entryId)
      .eq("event_id", eventId)
      .maybeSingle();
    const row = ent as { user_id?: string | null; email?: string | null } | null;
    if (row?.user_id) {
      userId = row.user_id;
    } else if (row?.email?.trim()) {
      const lookupEmail = row.email.trim();
      const { data: profExact } = await auth.admin.from("profiles").select("id").eq("email", lookupEmail).limit(2);
      if (profExact?.length === 1) {
        userId = (profExact[0] as { id: string }).id;
      } else {
        const { data: profI } = await auth.admin.from("profiles").select("id").ilike("email", lookupEmail).limit(2);
        if (profI?.length === 1) userId = (profI[0] as { id: string }).id;
      }
    }
  }

  if (!eventId || !userId) {
    return NextResponse.json(
      { ok: false, error: "Missing eventId or userId (send a search row entry id if user_id is unavailable)." },
      { status: 400 },
    );
  }

  const { data: profile } = await auth.admin
    .from("profiles")
    .select(
      "id,first_name,last_name,email,phone,pr_id,dob,sex,active_or_retired_military",
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  // Do not list kiosk_checked_in_at (or other new columns) unless the migration is applied — PostgREST fails the
  // whole select if any named column is missing, which yields empty entries and breaks the whole check-in UI.
  const { data: allEventEntries, error: entriesFetchError } = await auth.admin
    .from("entries")
    .select("*")
    .eq("event_id", eventId);

  if (entriesFetchError) {
    return NextResponse.json({ ok: false, error: entriesFetchError.message }, { status: 500 });
  }

  const entriesRaw = filterEntriesForProfile(allEventEntries ?? [], {
    id: userId,
    email: (profile as { email?: string | null }).email,
  }).sort(
    (a, b) =>
      new Date(String((a as { created_at?: string }).created_at ?? 0)).getTime() -
      new Date(String((b as { created_at?: string }).created_at ?? 0)).getTime(),
  );

  const { data: distancesRaw } = await auth.admin
    .from("distances")
    .select(
      "id,label,race_name,gun_time,sort_order,results_published_at,entry_fee_cents,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here,allow_free_tier,allow_pr_team_tier,allow_top_tier",
    )
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  const distances = ((distancesRaw ?? []) as DistanceRow[]).filter(
    (d) => !d.results_published_at,
  );
  const distById = new Map(distances.map((d) => [d.id, d]));

  const entriesMapped = (entriesRaw ?? []).map((e) => {
    const row = e as {
      id: string;
      distance_id: string;
      entry_type: string;
      source_entry_id: string | null;
      entry_kind: string;
      paid_at: string | null;
      paid_amount_cents: number | null;
      transponder_1: string | null;
      transponder_2: string | null;
      bib: string | null;
      kiosk_checked_in_at?: string | null;
    };
    return {
      ...row,
      kiosk_checked_in_at: row.kiosk_checked_in_at ?? null,
      distance_label: distById.get(row.distance_id)
        ? distanceLabel(distById.get(row.distance_id)!)
        : "Race",
    };
  });

  const finishTimeByEntry = new Map<string, { ms: number; display: string }>();
  const entryIds = entriesMapped.map((e) => e.id);
  if (entryIds.length > 0) {
    for (let i = 0; i < entryIds.length; i += 500) {
      const chunk = entryIds.slice(i, i + 500);
      const { data: rawRows } = await auth.admin
        .from("results_raw")
        .select("matched_entry_id,row_json,match_status")
        .eq("event_id", eventId)
        .in("matched_entry_id", chunk);
      for (const r of (rawRows ?? []) as Array<{
        matched_entry_id: string | null;
        match_status: string;
        row_json: { parsed?: { time_ms?: number | null; time_display?: string | null } } | null;
      }>) {
        if (r.match_status !== "matched" || !r.matched_entry_id) continue;
        const ms = r.row_json?.parsed?.time_ms;
        if (typeof ms !== "number" || ms <= 0) continue;
        const display = r.row_json?.parsed?.time_display?.trim() || null;
        finishTimeByEntry.set(r.matched_entry_id, { ms, display: display ?? String(ms) });
      }
    }
  }

  const entries = entriesMapped.map((e) => {
    const ft = finishTimeByEntry.get(e.id);
    return {
      ...e,
      finish_time_ms: ft?.ms ?? null,
      finish_time_display: ft?.display ?? null,
    };
  });

  const enteredDistanceIds = new Set(entries.map((e) => e.distance_id));

  const qualifier = distances.find((d) => d.is_peer_racing_qualifier && d.allow_roll_over_from_qualifier);
  const hasQualifierPrimary = Boolean(
    qualifier && entries.some((e) => e.distance_id === qualifier.id && e.entry_type === "primary"),
  );

  const rollOverOptions: { targetDistanceId: string; sourceDistanceId: string; label: string; entry_fee_cents: number }[] =
    [];
  if (hasQualifierPrimary && qualifier) {
    for (const d of distances) {
      if (!d.allow_qualifier_split_to_roll_over_here) continue;
      if (enteredDistanceIds.has(d.id)) continue;
      rollOverOptions.push({
        targetDistanceId: d.id,
        sourceDistanceId: qualifier.id,
        label: `${distanceLabel(d)} (Carry-Over from qualifier)`,
        entry_fee_cents: typeof d.entry_fee_cents === "number" ? d.entry_fee_cents : 0,
      });
    }
  }

  const rollTargetIds = new Set(rollOverOptions.map((r) => r.targetDistanceId));
  const upsellDistances = distances
    .filter((d) => !enteredDistanceIds.has(d.id) && !rollTargetIds.has(d.id))
    .map((d) => ({
      id: d.id,
      label: distanceLabel(d),
      entry_fee_cents: typeof d.entry_fee_cents === "number" ? d.entry_fee_cents : 0,
    }));

  const { data: membershipRow } = await auth.admin
    .from("memberships")
    .select("user_id,status,tier,membership_start_at,membership_end_at")
    .eq("user_id", userId)
    .maybeSingle();

  const tierConfigs = await fetchMembershipTierConfigs();
  const memberTier = membershipTierFromRow(membershipRow as MembershipRow | null);
  const tierLabel = tierLabelFromConfig(tierConfigs, memberTier);

  const qualifierRollOverTargets = qualifier
    ? distances.filter((d) => d.id !== qualifier.id && d.allow_qualifier_split_to_roll_over_here)
    : [];

  const enterDistanceItems = distances.map((d) => ({
    id: d.id,
    label: d.label ?? "Race",
    race_name: d.race_name ?? null,
    entry_fee_cents: typeof d.entry_fee_cents === "number" ? d.entry_fee_cents : 0,
    allow_free_tier: d.allow_free_tier,
    allow_pr_team_tier: d.allow_pr_team_tier,
    allow_top_tier: d.allow_top_tier,
  }));

  const gunTimes: Record<string, string> = {};
  for (const d of distances) {
    if (d.gun_time) {
      gunTimes[d.id] = new Date(d.gun_time).toLocaleString();
    }
  }

  const walletBalanceCents = await sumWalletBalanceCents(auth.admin, userId);

  return NextResponse.json({
    ok: true,
    profile: {
      id: (profile as { id: string }).id,
      first_name: (profile as { first_name?: string | null }).first_name ?? "",
      last_name: (profile as { last_name?: string | null }).last_name ?? "",
      email: (profile as { email?: string | null }).email ?? "",
      phone: (profile as { phone?: string | null }).phone ?? "",
      pr_id: (profile as { pr_id?: string | null }).pr_id ?? null,
      sex: (profile as { sex?: string | null }).sex ?? null,
      active_or_retired_military:
        (profile as { active_or_retired_military?: boolean | null }).active_or_retired_military ??
        null,
    },
    profileComplete: isProfileComplete(profile as ProfileRow),
    membership: {
      tier: memberTier,
      tierLabel,
      active: isMembershipActive(membershipRow as MembershipRow | null),
    },
    entries,
    upsellDistances,
    rollOverOptions,
    isWalkUp: entries.length === 0,
    enterFlow: {
      distances: enterDistanceItems,
      qualifierId: qualifier?.id ?? null,
      qualifierLabel: qualifier ? distanceLabel(qualifier) : "",
      rollOverTargets: qualifierRollOverTargets.map((t) => ({
        id: t.id,
        label: t.label ?? "Race",
        race_name: t.race_name ?? null,
        entry_fee_cents: typeof t.entry_fee_cents === "number" ? t.entry_fee_cents : 0,
        allow_free_tier: t.allow_free_tier,
        allow_pr_team_tier: t.allow_pr_team_tier,
        allow_top_tier: t.allow_top_tier,
      })),
      gunTimes,
      enteredDistanceIds: [...enteredDistanceIds],
      walletBalanceCents,
      memberTier,
      hasPaidEntryFees: distances.some((d) => (d.entry_fee_cents ?? 0) > 0),
    },
  });
}

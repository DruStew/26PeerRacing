import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { defaultDistancePayoutSettings } from "@/lib/payout/settings-map";
import type { DistancePayoutSettingsRow } from "@/lib/payout/types";
import { isValidBracketId } from "@/lib/payout/bracket";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

async function assertPromoterForEvent(eventId: string, userId: string, supabase: SupabaseClient) {
  const { data: event, error } = await supabase
    .from("events")
    .select("id,promoter_id")
    .eq("id", eventId)
    .single();
  if (error || !event) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 }) };
  }
  const promoterId = (event as { promoter_id: string }).promoter_id;
  if (promoterId === userId) {
    return { ok: true as const };
  }
  const { data: admin } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) {
    return { ok: true as const };
  }
  return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
}

function fractionFromPercentOrFraction(body: Record<string, unknown>, percentKey: string, fractionKey: string, fallback: number) {
  if (body[percentKey] !== undefined && body[percentKey] !== null && body[percentKey] !== "") {
    const p = Number(body[percentKey]);
    if (Number.isFinite(p)) return Math.min(1, Math.max(0, p / 100));
  }
  const f = Number(body[fractionKey]);
  return Number.isFinite(f) ? f : fallback;
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const distanceId = new URL(request.url).searchParams.get("distanceId")?.trim() ?? "";
  if (!distanceId) {
    return NextResponse.json({ ok: false, error: "Missing distanceId query parameter." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const gate = await assertPromoterForEvent(eventId, uid, supabase);
  if (!gate.ok) return gate.response;

  const { data: dist, error: distErr } = await supabase
    .from("distances")
    .select("id,label,entry_fee_cents")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (distErr || !dist) {
    return NextResponse.json({ ok: false, error: "Distance not found for this event." }, { status: 404 });
  }

  // Entry/check-in counts must see the whole field (same source of truth as the
  // check-in roster page) — promoter session RLS can't read other users' entries,
  // so use the service role after the promoter/admin gate above.
  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const { count: entryCount } = await service
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("distance_id", distanceId);

  const suggestedFeeCents = Math.max(0, Math.round((dist as { entry_fee_cents: number }).entry_fee_cents ?? 0));

  const { data: settings } = await supabase
    .from("distance_payout_settings")
    .select("*")
    .eq("distance_id", distanceId)
    .maybeSingle();

  // Same two-step lookup as the check-in roster page (entries, then profiles by
  // user_id) — there is no PostgREST FK relationship between entries and profiles,
  // so an embedded join silently returns nothing.
  const { data: entriesForCheckIn } = await service
    .from("entries")
    .select("user_id,kiosk_checked_in_at,sex,active_or_retired_military,entry_kind,paid_at,eligible")
    .eq("event_id", eventId)
    .eq("distance_id", distanceId);

  const entryRows = (entriesForCheckIn ?? []) as {
    user_id: string | null;
    kiosk_checked_in_at: string | null;
    sex: string | null;
    active_or_retired_military: boolean | null;
    entry_kind: string | null;
    paid_at: string | null;
    eligible: boolean | null;
  }[];
  const profileIds = [...new Set(entryRows.map((e) => e.user_id).filter((u): u is string => Boolean(u)))];
  const profilesRes =
    profileIds.length > 0
      ? await service.from("profiles").select("id,sex,active_or_retired_military").in("id", profileIds)
      : { data: [] };
  const profileById = new Map(
    ((profilesRes.data ?? []) as { id: string; sex: string | null; active_or_retired_military: boolean | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  let femaleEntryCount = 0;
  let militaryEntryCount = 0;
  let checkedInCount = 0;
  let checkedInPaidCount = 0;
  let checkedInFemaleCount = 0;
  let checkedInMilitaryCount = 0;
  for (const r of entryRows) {
    const p = r.user_id ? profileById.get(r.user_id) : undefined;
    // Entry-level values (demo / entry-only runners) win; profile is the fallback.
    const isFemale = (r.sex ?? p?.sex) === "female";
    const isMilitary = (r.active_or_retired_military ?? p?.active_or_retired_military) === true;
    if (isFemale) femaleEntryCount += 1;
    if (isMilitary) militaryEntryCount += 1;
    if (!r.kiosk_checked_in_at) continue;
    checkedInCount += 1;
    if (r.entry_kind === "paid" && r.paid_at && r.eligible !== false) checkedInPaidCount += 1;
    if (isFemale) checkedInFemaleCount += 1;
    if (isMilitary) checkedInMilitaryCount += 1;
  }

  return NextResponse.json({
    ok: true,
    distance: {
      id: (dist as { id: string }).id,
      label: (dist as { label: string }).label,
      entry_fee_cents: suggestedFeeCents,
    },
    settings: settings ?? null,
    suggestedEntryCount: entryCount ?? 0,
    suggestedFeeCents,
    femaleEntryCount,
    militaryEntryCount,
    checkedInCount,
    checkedInPaidCount,
    checkedInFemaleCount,
    checkedInMilitaryCount,
  });
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const gate = await assertPromoterForEvent(eventId, uid, supabase);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const distanceId = typeof body.distance_id === "string" ? body.distance_id.trim() : "";
  if (!distanceId) {
    return NextResponse.json({ ok: false, error: "Missing distance_id." }, { status: 400 });
  }

  const { data: distOk, error: distErr } = await supabase
    .from("distances")
    .select("id")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (distErr || !distOk) {
    return NextResponse.json({ ok: false, error: "Distance not found for this event." }, { status: 404 });
  }

  const defaults = defaultDistancePayoutSettings(distanceId);
  const cash_payouts_enabled = body.cash_payouts_enabled !== false;
  const cash_payout_mode = body.cash_payout_mode === "guaranteed" ? "guaranteed" : "entry_based";
  const guaranteed_cash_payout_cents = Math.max(
    0,
    Math.round(Number(body.guaranteed_cash_payout_cents ?? 0)),
  );

  const processing_fee_fraction = fractionFromPercentOrFraction(
    body,
    "processing_fee_percent",
    "processing_fee_fraction",
    defaults.processing_fee_fraction,
  );
  const shootout_fraction = fractionFromPercentOrFraction(body, "shootout_percent", "shootout_fraction", defaults.shootout_fraction);
  const pr_holding_fraction = fractionFromPercentOrFraction(body, "pr_holding_percent", "pr_holding_fraction", defaults.pr_holding_fraction);
  const producer_fraction_of_pr_holding = fractionFromPercentOrFraction(
    body,
    "producer_share_of_pr_holding_percent",
    "producer_fraction_of_pr_holding",
    defaults.producer_fraction_of_pr_holding,
  );

  const true_added_money_cents = Math.round(Number(body.true_added_money_cents ?? 0));
  const female_incentive_cents = Math.max(0, Math.round(Number(body.female_incentive_cents ?? 0)));
  const military_incentive_cents = Math.max(0, Math.round(Number(body.military_incentive_cents ?? 0)));
  const elite_division_carve_cents = Math.round(Number(body.elite_division_carve_cents ?? 0));
  const division_count = Math.min(5, Math.max(1, Math.floor(Number(body.division_count ?? 1))));
  const elite_division_index = Math.max(0, Math.floor(Number(body.elite_division_index ?? 0)));
  const schedule_mode = body.schedule_mode === "manual" ? "manual" : "auto";
  const manual_bracket =
    typeof body.manual_bracket === "string" && body.manual_bracket && isValidBracketId(body.manual_bracket)
      ? body.manual_bracket
      : null;
  const places_to_pay = Math.min(12, Math.max(1, Math.floor(Number(body.places_to_pay ?? 12))));
  const female_incentive_division_count = Math.min(
    5,
    Math.max(1, Math.floor(Number(body.female_incentive_division_count ?? 1))),
  );
  const female_incentive_places_to_pay = Math.min(
    12,
    Math.max(1, Math.floor(Number(body.female_incentive_places_to_pay ?? 12))),
  );
  const military_incentive_division_count = Math.min(
    5,
    Math.max(1, Math.floor(Number(body.military_incentive_division_count ?? 1))),
  );
  const military_incentive_places_to_pay = Math.min(
    12,
    Math.max(1, Math.floor(Number(body.military_incentive_places_to_pay ?? 12))),
  );
  const female_incentive_schedule_mode = body.female_incentive_schedule_mode === "manual" ? "manual" : "auto";
  const female_incentive_manual_bracket =
    typeof body.female_incentive_manual_bracket === "string" &&
    body.female_incentive_manual_bracket &&
    isValidBracketId(body.female_incentive_manual_bracket)
      ? body.female_incentive_manual_bracket
      : null;
  const military_incentive_schedule_mode = body.military_incentive_schedule_mode === "manual" ? "manual" : "auto";
  const military_incentive_manual_bracket =
    typeof body.military_incentive_manual_bracket === "string" &&
    body.military_incentive_manual_bracket &&
    isValidBracketId(body.military_incentive_manual_bracket)
      ? body.military_incentive_manual_bracket
      : null;
  const marketing_entry_count =
    body.marketing_entry_count === null || body.marketing_entry_count === ""
      ? null
      : Math.max(0, Math.floor(Number(body.marketing_entry_count)));
  const marketing_entry_fee_cents =
    body.marketing_entry_fee_cents === null || body.marketing_entry_fee_cents === ""
      ? null
      : Math.max(0, Math.round(Number(body.marketing_entry_fee_cents)));
  const marketing_female_entry_count = Math.max(
    0,
    Math.floor(Number(body.marketing_female_entry_count ?? 0)),
  );
  const marketing_military_entry_count = Math.max(
    0,
    Math.floor(Number(body.marketing_military_entry_count ?? 0)),
  );

  let division_labels: string[] | null = null;
  if (Array.isArray(body.division_labels)) {
    division_labels = body.division_labels.map((x) => String(x));
  }

  if (elite_division_index >= division_count) {
    return NextResponse.json({ ok: false, error: "Selected division must be within the number of divisions paid." }, { status: 400 });
  }
  if (schedule_mode === "manual" && !manual_bracket) {
    return NextResponse.json({ ok: false, error: "Manual schedule mode requires manual_bracket." }, { status: 400 });
  }
  if (female_incentive_schedule_mode === "manual" && !female_incentive_manual_bracket) {
    return NextResponse.json(
      { ok: false, error: "Female incentive manual schedule mode requires female_incentive_manual_bracket." },
      { status: 400 },
    );
  }
  if (military_incentive_schedule_mode === "manual" && !military_incentive_manual_bracket) {
    return NextResponse.json(
      { ok: false, error: "Military incentive manual schedule mode requires military_incentive_manual_bracket." },
      { status: 400 },
    );
  }

  const row: Omit<DistancePayoutSettingsRow, "updated_at"> = {
    ...defaults,
    cash_payouts_enabled,
    cash_payout_mode,
    guaranteed_cash_payout_cents,
    marketing_entry_count,
    marketing_entry_fee_cents,
    marketing_female_entry_count,
    marketing_military_entry_count,
    processing_fee_fraction,
    shootout_fraction,
    pr_holding_fraction,
    producer_fraction_of_pr_holding,
    true_added_money_cents,
    female_incentive_cents,
    military_incentive_cents,
    female_incentive_division_count,
    female_incentive_places_to_pay,
    female_incentive_schedule_mode,
    female_incentive_manual_bracket:
      female_incentive_schedule_mode === "manual" ? female_incentive_manual_bracket : null,
    military_incentive_division_count,
    military_incentive_places_to_pay,
    military_incentive_schedule_mode,
    military_incentive_manual_bracket:
      military_incentive_schedule_mode === "manual" ? military_incentive_manual_bracket : null,
    elite_division_carve_cents,
    division_count,
    elite_division_index,
    schedule_mode,
    manual_bracket: schedule_mode === "manual" ? manual_bracket : null,
    places_to_pay,
    division_labels,
    entry_count_override: null,
    entry_fee_cents_override: null,
  };

  const { data, error } = await supabase
    .from("distance_payout_settings")
    .upsert(
      {
        ...row,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "distance_id" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: data });
}

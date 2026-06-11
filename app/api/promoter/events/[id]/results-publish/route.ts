import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { computeConsoleResults, MIN_FINISHERS } from "@/lib/results-console/compute";
import { loadFinishersForDistance, type FinisherRow } from "@/lib/results-console/finishers";
import type { DistancePayoutSettingsRow } from "@/lib/payout/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const WRITE_CHUNK = 200;

async function gate(eventId: string, supabase: SupabaseClient) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: event, error } = await supabase
    .from("events")
    .select("id,promoter_id")
    .eq("id", eventId)
    .single();
  if (error || !event) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 }) };
  }
  if ((event as { promoter_id: string }).promoter_id === uid) return { ok: true as const };
  const { data: admin } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) return { ok: true as const };
  return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
}

async function setEventPublishedFlag(service: SupabaseClient, eventId: string) {
  const { count } = await service
    .from("distances")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .not("results_published_at", "is", null);
  await service
    .from("events")
    .update({ results_published: (count ?? 0) > 0 })
    .eq("id", eventId);
}

/**
 * POST { distance_id, action?: "publish" | "unpublish", min_percentile, max_percentile }
 *
 * Publish recomputes divisions/payouts server-side from the matched import rows and
 * the saved payout settings — the client never sends placements or dollar amounts.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  let body: { distance_id?: string; action?: string; min_percentile?: number; max_percentile?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const distanceId = String(body.distance_id ?? "").trim();
  if (!distanceId) {
    return NextResponse.json({ ok: false, error: "Missing distance_id." }, { status: 400 });
  }

  const { data: dist } = await service
    .from("distances")
    .select("id,entry_fee_cents")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json({ ok: false, error: "Distance not found for this event." }, { status: 404 });
  }

  const action = body.action === "unpublish" ? "unpublish" : "publish";

  if (action === "unpublish") {
    // Badges cascade from results via result_id, but clear any strays too.
    const { error: badgeErr } = await service
      .from("badges")
      .delete()
      .eq("event_id", eventId)
      .eq("distance_id", distanceId);
    if (badgeErr) return NextResponse.json({ ok: false, error: badgeErr.message }, { status: 500 });
    const { error: resErr } = await service
      .from("results")
      .delete()
      .eq("event_id", eventId)
      .eq("distance_id", distanceId);
    if (resErr) return NextResponse.json({ ok: false, error: resErr.message }, { status: 500 });
    await service.from("distances").update({ results_published_at: null }).eq("id", distanceId);
    // Reverse the shootout fund banking — unpublished races contribute nothing.
    await service.from("shootout_fund_ledger").delete().eq("distance_id", distanceId);
    await setEventPublishedFlag(service, eventId);
    return NextResponse.json({ ok: true, action: "unpublish" });
  }

  const minPercentile = Math.min(50, Math.max(0, Number(body.min_percentile ?? 5)));
  const maxPercentile = Math.min(100, Math.max(50, Number(body.max_percentile ?? 95)));

  const { finishers } = await loadFinishersForDistance(service, eventId, distanceId);
  if (finishers.length < MIN_FINISHERS) {
    return NextResponse.json(
      { ok: false, error: `Need at least ${MIN_FINISHERS} matched finishers to publish (have ${finishers.length}).` },
      { status: 400 },
    );
  }

  const { data: settings } = await service
    .from("distance_payout_settings")
    .select("*")
    .eq("distance_id", distanceId)
    .maybeSingle();

  const { count: registeredEntryCount } = await service
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("distance_id", distanceId);

  const comp = computeConsoleResults({
    rows: finishers,
    settings: (settings as DistancePayoutSettingsRow | null) ?? null,
    distanceId,
    liveFeeCents: Math.max(0, (dist as { entry_fee_cents: number }).entry_fee_cents ?? 0),
    registeredEntryCount: registeredEntryCount ?? null,
    minPercentile,
    maxPercentile,
  });
  if ("error" in comp) {
    return NextResponse.json({ ok: false, error: comp.error }, { status: 400 });
  }

  // Map algorithm entries back to finisher rows (entry.id is prId ?? entryId).
  const finisherByAlgoId = new Map<string, FinisherRow>(finishers.map((f) => [f.id, f]));

  const mainPlacing = new Map<string, { division: string; place: number }>();
  for (const [div, runners] of comp.main.winners) {
    runners.forEach((e, idx) => mainPlacing.set(e.id, { division: div, place: idx + 1 }));
  }
  const incentivePlacing = comp.incentives.map((pool) => {
    const m = new Map<string, { division: string; place: number }>();
    for (const [div, runners] of pool.result.winners) {
      runners.forEach((e, idx) => m.set(e.id, { division: div, place: idx + 1 }));
    }
    return m;
  });

  const publishedAt = new Date().toISOString();

  const resultRows = comp.entries.map((e) => {
    const f = finisherByAlgoId.get(e.id);
    const placing = mainPlacing.get(e.id);
    const row: Record<string, unknown> = {
      event_id: eventId,
      distance_id: distanceId,
      entry_id: f?.entryId ?? null,
      user_id: f?.userId ?? null,
      bib: e.bibNumber || null,
      first_name: e.firstName,
      last_name: e.lastName,
      finish_time_ms: f?.timeMs ?? e.timeS * 1000,
      overall_rank: e.overallRank,
      division: placing?.division ?? null,
      division_place: placing?.place ?? null,
      payout_cents: Math.round(e.payout),
      female_incentive_division: null as string | null,
      female_incentive_place: null as number | null,
      female_incentive_payout_cents: 0,
      military_incentive_division: null as string | null,
      military_incentive_place: null as number | null,
      military_incentive_payout_cents: 0,
      published: true,
      published_at: publishedAt,
    };
    comp.incentives.forEach((pool, i) => {
      const ip = incentivePlacing[i].get(e.id);
      if (!ip) return;
      const payout = Math.round(e.getIncentivePayout(i));
      if (pool.key === "female") {
        row.female_incentive_division = ip.division;
        row.female_incentive_place = ip.place;
        row.female_incentive_payout_cents = payout;
      } else {
        row.military_incentive_division = ip.division;
        row.military_incentive_place = ip.place;
        row.military_incentive_payout_cents = payout;
      }
    });
    return row;
  });

  // Republish = wipe and rewrite (badges cascade via result_id, strays cleared explicitly).
  const { error: badgeDelErr } = await service
    .from("badges")
    .delete()
    .eq("event_id", eventId)
    .eq("distance_id", distanceId);
  if (badgeDelErr) return NextResponse.json({ ok: false, error: badgeDelErr.message }, { status: 500 });
  const { error: resDelErr } = await service
    .from("results")
    .delete()
    .eq("event_id", eventId)
    .eq("distance_id", distanceId);
  if (resDelErr) return NextResponse.json({ ok: false, error: resDelErr.message }, { status: 500 });

  const resultIdByEntryId = new Map<string, string>();
  for (let i = 0; i < resultRows.length; i += WRITE_CHUNK) {
    const { data: inserted, error: insErr } = await service
      .from("results")
      .insert(resultRows.slice(i, i + WRITE_CHUNK))
      .select("id,entry_id");
    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
    for (const r of (inserted ?? []) as Array<{ id: string; entry_id: string | null }>) {
      if (r.entry_id) resultIdByEntryId.set(r.entry_id, r.id);
    }
  }

  // Badges: division badge for every finisher with an account; incentive badges for paid places.
  const badgeRows: Record<string, unknown>[] = [];
  for (const e of comp.entries) {
    const f = finisherByAlgoId.get(e.id);
    if (!f?.userId) continue;
    const resultId = resultIdByEntryId.get(f.entryId) ?? null;
    const placing = mainPlacing.get(e.id);
    if (placing) {
      badgeRows.push({
        event_id: eventId,
        distance_id: distanceId,
        user_id: f.userId,
        entry_id: f.entryId,
        result_id: resultId,
        badge_key: `division_${placing.division.toLowerCase()}`,
        badge_title: `${placing.division} Division`,
        division: placing.division,
        division_place: placing.place,
        payout_cents: Math.round(e.payout),
      });
    }
    comp.incentives.forEach((pool, i) => {
      const ip = incentivePlacing[i].get(e.id);
      const payout = Math.round(e.getIncentivePayout(i));
      if (!ip || payout <= 0) return;
      badgeRows.push({
        event_id: eventId,
        distance_id: distanceId,
        user_id: f.userId,
        entry_id: f.entryId,
        result_id: resultId,
        badge_key: `${pool.key}_incentive`,
        badge_title: pool.key === "female" ? "Female Incentive" : "Military Incentive",
        division: ip.division,
        division_place: ip.place,
        payout_cents: payout,
      });
    });
  }

  for (let i = 0; i < badgeRows.length; i += WRITE_CHUNK) {
    const { error: badgeInsErr } = await service.from("badges").insert(badgeRows.slice(i, i + WRITE_CHUNK));
    if (badgeInsErr) {
      return NextResponse.json({ ok: false, error: badgeInsErr.message }, { status: 500 });
    }
  }

  await service.from("distances").update({ results_published_at: publishedAt }).eq("id", distanceId);

  // Bank this race's shootout fund holding (idempotent: republish overwrites the same row).
  const { data: eventRow } = await service.from("events").select("promoter_id").eq("id", eventId).maybeSingle();
  const { error: shootoutErr } = await service.from("shootout_fund_ledger").upsert(
    {
      event_id: eventId,
      distance_id: distanceId,
      promoter_id: (eventRow as { promoter_id?: string | null } | null)?.promoter_id ?? null,
      fraction: comp.shootoutFraction,
      entry_count: comp.potEntryCount,
      amount_cents: comp.shootoutFundCents,
      created_at: publishedAt,
    },
    { onConflict: "distance_id" },
  );
  if (shootoutErr) {
    return NextResponse.json({ ok: false, error: `Shootout fund ledger: ${shootoutErr.message}` }, { status: 500 });
  }

  await setEventPublishedFlag(service, eventId);

  return NextResponse.json({
    ok: true,
    action: "publish",
    publishedAt,
    summary: {
      finishers: comp.finishers,
      resultsWritten: resultRows.length,
      badgesAwarded: badgeRows.length,
      totalMainPaidCents: comp.totalMainPaidCents,
      totalIncentivePaidCents: comp.totalIncentivePaidCents,
      shootoutFundCents: comp.shootoutFundCents,
    },
  });
}

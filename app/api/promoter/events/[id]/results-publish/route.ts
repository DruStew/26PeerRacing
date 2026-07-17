import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { computeConsoleResults } from "@/lib/results-console/compute";
import { loadFinishersForDistance, type FinisherRow } from "@/lib/results-console/finishers";
import { DEMO_PUBLISH_BLOCKED, loadEventIsDemo } from "@/lib/demo/event";
import type { DistancePayoutSettingsRow } from "@/lib/payout/types";
import { rulesForPlacement, type PrizeRule, type PrizeSettings } from "@/lib/prizes/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  creditRacePayoutsForDistance,
  reverseRacePayoutsForDistance,
  type RacePayoutCredit,
} from "@/lib/wallet/credit-race-payout";
import {
  creditPromoterEarningsForDistance,
  reversePromoterEarningsForDistance,
} from "@/lib/wallet/credit-promoter-earnings";
import { countChecksFromResults } from "@/lib/admin/load-finance-stats";
import {
  formatUnpublishBlockersMessage,
  getUnpublishSpendBlockers,
} from "@/lib/wallet/unpublish-spend-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const WRITE_CHUNK = 200;
const COMPLETED_PRIZE_STATUSES = new Set(["picked_up", "shipped", "delivered"]);

type PrizeDraft = {
  entryId: string | null;
  category: "main" | "female" | "military";
  division: string;
  place: number;
  awardOrder: number;
  prizeName: string;
  costCents: number;
  retailValueCents: number;
};

function prizeSignature(value: {
  entryId: string | null;
  category: string;
  division: string;
  place: number;
  awardOrder: number;
  prizeName: string;
  costCents: number;
  retailValueCents: number;
}) {
  return [
    value.entryId ?? "",
    value.category,
    value.division,
    value.place,
    value.awardOrder,
    value.prizeName,
    value.costCents,
    value.retailValueCents,
  ].join("\u001f");
}

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
  const { data: admin } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  const isAdmin = Boolean(admin);
  if ((event as { promoter_id: string }).promoter_id === uid) {
    return { ok: true as const, uid, isAdmin };
  }
  if (isAdmin) return { ok: true as const, uid, isAdmin };
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

  if (await loadEventIsDemo(service, eventId)) {
    return NextResponse.json(
      { ok: false, error: DEMO_PUBLISH_BLOCKED, code: "demo_event" },
      { status: 403 },
    );
  }

  let body: {
    distance_id?: string;
    action?: string;
    min_percentile?: number;
    max_percentile?: number;
    force_unpublish?: boolean;
    force_prize_republish?: boolean;
  };
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
    const forceUnpublish = body.force_unpublish === true && gated.isAdmin;
    if (!forceUnpublish) {
      const blockers = await getUnpublishSpendBlockers(service, distanceId);
      if (blockers.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            code: "unpublish_wallet_spent",
            error: formatUnpublishBlockersMessage(blockers),
            blockers,
          },
          { status: 409 },
        );
      }
    }
    if (body.force_prize_republish !== true) {
      const { data: prizeAwards } = await service
        .from("published_prize_awards")
        .select("id")
        .eq("distance_id", distanceId);
      const prizeAwardIds = (prizeAwards ?? []).map((award) => (award as { id: string }).id);
      if (prizeAwardIds.length > 0) {
        const { count: completedAwardsAffected } = await service
          .from("prize_award_fulfillment")
          .select("award_id", { count: "exact", head: true })
          .in("award_id", prizeAwardIds)
          .in("status", [...COMPLETED_PRIZE_STATUSES]);
        if ((completedAwardsAffected ?? 0) > 0) {
          return NextResponse.json(
            {
              ok: false,
              code: "completed_prizes_changed",
              completedAwardsAffected,
              error: `${completedAwardsAffected} completed prize award${completedAwardsAffected === 1 ? "" : "s"} would be removed from the fulfillment log. Confirm unpublish to continue.`,
            },
            { status: 409 },
          );
        }
      }
    }

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
    await service.from("distance_financial_snapshots").delete().eq("distance_id", distanceId);
    // Claw back the race-winnings wallet credits for this distance.
    const reversed = await reverseRacePayoutsForDistance(service, distanceId);
    if (!reversed.ok) {
      return NextResponse.json({ ok: false, error: `Wallet reversal: ${reversed.error}` }, { status: 500 });
    }
    const reversedPromoter = await reversePromoterEarningsForDistance(service, distanceId);
    if (!reversedPromoter.ok) {
      return NextResponse.json({ ok: false, error: `Promoter wallet reversal: ${reversedPromoter.error}` }, { status: 500 });
    }
    await setEventPublishedFlag(service, eventId);
    return NextResponse.json({ ok: true, action: "unpublish" });
  }

  const minPercentile = Math.min(50, Math.max(0, Number(body.min_percentile ?? 5)));
  const maxPercentile = Math.min(100, Math.max(50, Number(body.max_percentile ?? 95)));

  const { finishers } = await loadFinishersForDistance(service, eventId, distanceId);
  if (finishers.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Need at least one matched finisher to publish." },
      { status: 400 },
    );
  }

  const { data: settings } = await service
    .from("distance_payout_settings")
    .select("*")
    .eq("distance_id", distanceId)
    .maybeSingle();

  const { data: prizeSettingsRaw } = await service
    .from("distance_prize_settings")
    .select("*")
    .eq("distance_id", distanceId)
    .maybeSingle();
  const prizeSettings = (prizeSettingsRaw as PrizeSettings | null) ?? null;
  const { data: prizeRulesRaw } = prizeSettings
    ? await service
        .from("distance_prize_rules")
        .select("id,category,division,place,sort_order,prize_name,cost_cents,retail_value_cents")
        .eq("distance_id", distanceId)
        .eq("config_id", prizeSettings.current_config_id)
    : { data: [] };
  const prizeRules = (prizeRulesRaw ?? []) as PrizeRule[];

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
    prizeCategories: {
      female: prizeSettings?.female_prizes_enabled === true,
      military: prizeSettings?.military_prizes_enabled === true,
    },
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

  const prizeDrafts: PrizeDraft[] = [];
  const addPrizeDrafts = (
    e: (typeof comp.entries)[number],
    category: "main" | "female" | "military",
    placing: { division: string; place: number } | undefined,
  ) => {
    if (!placing) return;
    const f = finisherByAlgoId.get(e.id);
    const awards = rulesForPlacement(prizeRules, category, placing.division, placing.place);
    awards.forEach((award, awardOrder) => {
      prizeDrafts.push({
        entryId: f?.entryId ?? null,
        category,
        division: placing.division,
        place: placing.place,
        awardOrder,
        prizeName: award.prize_name,
        costCents: award.cost_cents,
        retailValueCents: award.retail_value_cents,
      });
    });
  };
  for (const e of comp.entries) {
    if (prizeSettings?.main_prizes_enabled) addPrizeDrafts(e, "main", mainPlacing.get(e.id));
    comp.incentives.forEach((pool, index) => {
      if (pool.key === "female" && prizeSettings?.female_prizes_enabled) {
        addPrizeDrafts(e, "female", incentivePlacing[index].get(e.id));
      }
      if (pool.key === "military" && prizeSettings?.military_prizes_enabled) {
        addPrizeDrafts(e, "military", incentivePlacing[index].get(e.id));
      }
    });
  }

  // Preserve pickup/delivery status when an identical award survives a re-publish.
  // If a completed award would disappear or change, require an explicit confirmation.
  const { data: oldAwardsRaw } = await service
    .from("published_prize_awards")
    .select("id,result_id,category,division,place,award_order,prize_name,retail_value_cents")
    .eq("distance_id", distanceId);
  const oldAwards = (oldAwardsRaw ?? []) as Array<{
    id: string;
    result_id: string;
    category: string;
    division: string;
    place: number;
    award_order: number;
    prize_name: string;
    retail_value_cents: number;
  }>;
  const oldResultIds = [...new Set(oldAwards.map((award) => award.result_id))];
  const { data: oldResultsRaw } =
    oldResultIds.length > 0
      ? await service.from("results").select("id,entry_id").in("id", oldResultIds)
      : { data: [] };
  const oldEntryByResultId = new Map(
    ((oldResultsRaw ?? []) as Array<{ id: string; entry_id: string | null }>).map((row) => [row.id, row.entry_id]),
  );
  const oldAwardIds = oldAwards.map((award) => award.id);
  const { data: oldFulfillmentRaw } =
    oldAwardIds.length > 0
      ? await service
          .from("prize_award_fulfillment")
          .select("award_id,cost_cents,status,fulfilled_at,fulfilled_by,note")
          .in("award_id", oldAwardIds)
      : { data: [] };
  const oldFulfillment = (oldFulfillmentRaw ?? []) as Array<{
    award_id: string;
    cost_cents: number;
    status: string;
    fulfilled_at: string | null;
    fulfilled_by: string | null;
    note: string | null;
  }>;
  const fulfillmentByAward = new Map(oldFulfillment.map((row) => [row.award_id, row]));
  const oldBySignature = new Map<string, (typeof oldFulfillment)[number]>();
  for (const award of oldAwards) {
    const fulfillment = fulfillmentByAward.get(award.id);
    if (!fulfillment) continue;
    oldBySignature.set(
      prizeSignature({
        entryId: oldEntryByResultId.get(award.result_id) ?? null,
        category: award.category,
        division: award.division,
        place: award.place,
        awardOrder: award.award_order,
        prizeName: award.prize_name,
        costCents: fulfillment.cost_cents,
        retailValueCents: award.retail_value_cents,
      }),
      fulfillment,
    );
  }
  const nextSignatures = new Set(
    prizeDrafts.map((draft) =>
      prizeSignature({
        entryId: draft.entryId,
        category: draft.category,
        division: draft.division,
        place: draft.place,
        awardOrder: draft.awardOrder,
        prizeName: draft.prizeName,
        costCents: draft.costCents,
        retailValueCents: draft.retailValueCents,
      }),
    ),
  );
  const completedAwardsAffected = [...oldBySignature.entries()].filter(
    ([signature, fulfillment]) =>
      COMPLETED_PRIZE_STATUSES.has(fulfillment.status) && !nextSignatures.has(signature),
  ).length;
  if (completedAwardsAffected > 0 && body.force_prize_republish !== true) {
    return NextResponse.json(
      {
        ok: false,
        code: "completed_prizes_changed",
        completedAwardsAffected,
        error: `${completedAwardsAffected} completed prize award${completedAwardsAffected === 1 ? "" : "s"} would change. Confirm the re-publish to continue.`,
      },
      { status: 409 },
    );
  }

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

  let prizeAwardsWritten = 0;
  let prizeCostCents = 0;
  let prizeRetailValueCents = 0;
  const publicAwardRows = prizeDrafts.flatMap((draft) => {
    const resultId = draft.entryId ? resultIdByEntryId.get(draft.entryId) : null;
    if (!resultId) return [];
    prizeCostCents += draft.costCents;
    prizeRetailValueCents += draft.retailValueCents;
    return [{
      result_id: resultId,
      event_id: eventId,
      distance_id: distanceId,
      category: draft.category,
      division: draft.division,
      place: draft.place,
      award_order: draft.awardOrder,
      prize_name: draft.prizeName,
      retail_value_cents: draft.retailValueCents,
      show_retail_value: prizeSettings?.show_individual_retail_values === true,
      show_total_award_value: prizeSettings?.show_total_award_value !== false,
      published_at: publishedAt,
      _entry_id: draft.entryId,
      _cost_cents: draft.costCents,
    }];
  });
  for (let i = 0; i < publicAwardRows.length; i += WRITE_CHUNK) {
    const chunk = publicAwardRows.slice(i, i + WRITE_CHUNK);
    const { data: insertedAwards, error: awardError } = await service
      .from("published_prize_awards")
      .insert(chunk.map(({ _cost_cents: costCents, _entry_id: entryId, ...row }) => {
        void costCents;
        void entryId;
        return row;
      }))
      .select("id,result_id,category,division,place,award_order,prize_name,retail_value_cents");
    if (awardError) return NextResponse.json({ ok: false, error: `Prize awards: ${awardError.message}` }, { status: 500 });
    const fulfillmentRows = ((insertedAwards ?? []) as Array<{
      id: string;
      result_id: string;
      category: string;
      division: string;
      place: number;
      award_order: number;
      prize_name: string;
      retail_value_cents: number;
    }>).map((award) => {
      const source = chunk.find(
        (candidate) =>
          candidate.result_id === award.result_id &&
          candidate.category === award.category &&
          candidate.division === award.division &&
          candidate.place === award.place &&
          candidate.award_order === award.award_order &&
          candidate.prize_name === award.prize_name,
      );
      const costCents = source?._cost_cents ?? 0;
      const previous = oldBySignature.get(
        prizeSignature({
          entryId: source?._entry_id ?? null,
          category: award.category,
          division: award.division,
          place: award.place,
          awardOrder: award.award_order,
          prizeName: award.prize_name,
          costCents,
          retailValueCents: award.retail_value_cents,
        }),
      );
      return {
        award_id: award.id,
        cost_cents: costCents,
        status: previous?.status ?? "awaiting_pickup",
        fulfilled_at: previous?.fulfilled_at ?? null,
        fulfilled_by: previous?.fulfilled_by ?? null,
        note: previous?.note ?? null,
        updated_at: publishedAt,
      };
    });
    if (fulfillmentRows.length > 0) {
      const { error: fulfillmentError } = await service.from("prize_award_fulfillment").insert(fulfillmentRows);
      if (fulfillmentError) {
        return NextResponse.json({ ok: false, error: `Prize fulfillment: ${fulfillmentError.message}` }, { status: 500 });
      }
    }
    prizeAwardsWritten += fulfillmentRows.length;
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

  // Credit each racer's net winnings (division + incentives) to their wallet.
  const { data: eventMeta } = await service.from("events").select("name").eq("id", eventId).maybeSingle();
  const { data: distMeta } = await service.from("distances").select("label").eq("id", distanceId).maybeSingle();
  const payoutCredits: RacePayoutCredit[] = [];
  for (const e of comp.entries) {
    const f = finisherByAlgoId.get(e.id);
    if (!f?.userId) continue;
    const incentiveTotal = comp.incentives.reduce((s, _pool, i) => s + Math.round(e.getIncentivePayout(i)), 0);
    const total = Math.round(e.payout) + incentiveTotal;
    if (total <= 0) continue;
    payoutCredits.push({
      userId: f.userId,
      entryId: f.entryId,
      resultId: resultIdByEntryId.get(f.entryId) ?? null,
      amountCents: total,
    });
  }
  const credited = await creditRacePayoutsForDistance(service, {
    eventId,
    distanceId,
    eventName: (eventMeta as { name?: string | null } | null)?.name ?? "Race",
    distanceLabel: (distMeta as { label?: string | null } | null)?.label ?? "Race",
    credits: payoutCredits,
  });
  if (!credited.ok) {
    return NextResponse.json({ ok: false, error: `Wallet payout: ${credited.error}` }, { status: 500 });
  }

  const { data: eventRow } = await service.from("events").select("promoter_id,name").eq("id", eventId).maybeSingle();
  const promoterId = (eventRow as { promoter_id?: string | null } | null)?.promoter_id ?? null;
  const eventName = (eventRow as { name?: string | null } | null)?.name ?? "Race";
  const distanceLabel = (distMeta as { label?: string | null } | null)?.label ?? "Race";

  let promoterCreditedCents = 0;
  if (promoterId && comp.producerCents > 0) {
    const promoterCredit = await creditPromoterEarningsForDistance(service, {
      eventId,
      distanceId,
      promoterId,
      eventName,
      distanceLabel,
      amountCents: comp.producerCents,
    });
    if (!promoterCredit.ok) {
      return NextResponse.json({ ok: false, error: `Promoter wallet: ${promoterCredit.error}` }, { status: 500 });
    }
    promoterCreditedCents = promoterCredit.creditedCents;
  } else {
    await reversePromoterEarningsForDistance(service, distanceId);
  }

  const checksPaidCount = countChecksFromResults(resultRows);
  const totalRunnerPayoutCents = comp.totalMainPaidCents + comp.totalIncentivePaidCents;
  const { error: snapshotErr } = await service.from("distance_financial_snapshots").upsert(
    {
      distance_id: distanceId,
      event_id: eventId,
      promoter_id: promoterId,
      published_at: publishedAt,
      entry_count: comp.potEntryCount,
      gross_pot_cents: comp.grossPotCents,
      processing_fee_cents: comp.processingFeeCents,
      shootout_fund_cents: comp.shootoutFundCents,
      pr_holding_cents: comp.prHoldingCents,
      producer_cents: comp.producerCents,
      peer_racing_org_cents: comp.peerRacingOrgCents,
      racers_pot_cents: comp.racersPotCents,
      total_runner_payout_cents: totalRunnerPayoutCents,
      checks_paid_count: checksPaidCount,
      prize_cost_cents: prizeCostCents,
      prize_retail_value_cents: prizeRetailValueCents,
      prize_award_count: prizeAwardsWritten,
    },
    { onConflict: "distance_id" },
  );
  if (snapshotErr) {
    return NextResponse.json({ ok: false, error: `Finance snapshot: ${snapshotErr.message}` }, { status: 500 });
  }

  // Bank this race's shootout fund holding (idempotent: republish overwrites the same row).
  const { error: shootoutErr } = await service.from("shootout_fund_ledger").upsert(
    {
      event_id: eventId,
      distance_id: distanceId,
      promoter_id: promoterId,
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
      racersPaid: credited.racersPaid,
      walletCreditedCents: credited.totalCents,
      promoterCreditedCents,
      prizeAwardsWritten,
      prizeCostCents,
      prizeRetailValueCents,
    },
  });
}

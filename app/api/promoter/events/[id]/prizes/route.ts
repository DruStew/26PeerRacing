import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PRIZE_CATEGORIES, type PrizeCategory, type PrizeRule } from "@/lib/prizes/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DIVISIONS = new Set(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);

async function gate(eventId: string, distanceId: string, supabase: SupabaseClient) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: distance } = await supabase
    .from("distances")
    .select("id,event_id,results_published_at,events!inner(promoter_id)")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!distance) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Distance not found" }, { status: 404 }) };
  }
  const promoterId = (
    distance as unknown as { events: { promoter_id: string }; results_published_at: string | null }
  ).events.promoter_id;
  const { data: admin } = await supabase.from("roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (promoterId !== uid && !admin) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return {
    ok: true as const,
    resultsPublishedAt: (distance as { results_published_at: string | null }).results_published_at,
  };
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const distanceId = new URL(request.url).searchParams.get("distanceId")?.trim() ?? "";
  if (!distanceId) {
    return NextResponse.json({ ok: false, error: "Missing distanceId query parameter." }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, distanceId, supabase);
  if (!gated.ok) return gated.response;

  const { data: settings, error } = await supabase
    .from("distance_prize_settings")
    .select("*")
    .eq("distance_id", distanceId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let rules: PrizeRule[] = [];
  if (settings) {
    const { data, error: ruleError } = await supabase
      .from("distance_prize_rules")
      .select("id,category,division,place,sort_order,prize_name,cost_cents,retail_value_cents")
      .eq("distance_id", distanceId)
      .eq("config_id", (settings as { current_config_id: string }).current_config_id)
      .order("category")
      .order("division", { nullsFirst: true })
      .order("place")
      .order("sort_order");
    if (ruleError) return NextResponse.json({ ok: false, error: ruleError.message }, { status: 500 });
    rules = (data ?? []) as PrizeRule[];
  }

  return NextResponse.json({ ok: true, settings: settings ?? null, rules, resultsPublishedAt: gated.resultsPublishedAt });
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const distanceId = typeof body.distance_id === "string" ? body.distance_id.trim() : "";
  if (!distanceId) return NextResponse.json({ ok: false, error: "Missing distance_id." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, distanceId, supabase);
  if (!gated.ok) return gated.response;

  const rawRules = Array.isArray(body.rules) ? body.rules : [];
  if (rawRules.length > 300) {
    return NextResponse.json({ ok: false, error: "A distance cannot have more than 300 prize lines." }, { status: 400 });
  }

  const rules: PrizeRule[] = [];
  for (const value of rawRules) {
    const raw = value as Record<string, unknown>;
    const category = String(raw.category ?? "") as PrizeCategory;
    const division = raw.division == null || raw.division === "" ? null : String(raw.division);
    const place = Math.floor(Number(raw.place));
    const prizeName = String(raw.prize_name ?? "").trim();
    if (!PRIZE_CATEGORIES.includes(category) || (division !== null && !DIVISIONS.has(division))) {
      return NextResponse.json({ ok: false, error: "A prize has an invalid category or division." }, { status: 400 });
    }
    if (place < 1 || place > 12 || !prizeName || prizeName.length > 160) {
      return NextResponse.json({ ok: false, error: "Prize names are required and places must be between 1 and 12." }, { status: 400 });
    }
    rules.push({
      category,
      division,
      place,
      sort_order: Math.max(0, Math.floor(Number(raw.sort_order) || 0)),
      prize_name: prizeName,
      cost_cents: Math.max(0, Math.round(Number(raw.cost_cents) || 0)),
      retail_value_cents: Math.max(0, Math.round(Number(raw.retail_value_cents) || 0)),
    });
  }

  const { data: previous } = await supabase
    .from("distance_prize_settings")
    .select("current_config_id")
    .eq("distance_id", distanceId)
    .maybeSingle();
  const configId = crypto.randomUUID();
  if (rules.length > 0) {
    const { error: insertError } = await supabase.from("distance_prize_rules").insert(
      rules.map((rule) => ({ ...rule, distance_id: distanceId, config_id: configId })),
    );
    if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  const updatedAt = new Date().toISOString();
  const publicAwardsDisplay = ["none", "cash", "prizes", "both"].includes(String(body.public_awards_display))
    ? String(body.public_awards_display)
    : "none";
  const settingsRow = {
    distance_id: distanceId,
    current_config_id: configId,
    main_prizes_enabled: body.main_prizes_enabled === true,
    female_prizes_enabled: body.female_prizes_enabled === true,
    military_prizes_enabled: body.military_prizes_enabled === true,
    show_individual_retail_values: body.show_individual_retail_values === true,
    show_total_award_value: body.show_total_award_value !== false,
    public_awards_display: publicAwardsDisplay,
    updated_at: updatedAt,
  };
  const { data: settings, error: settingsError } = await supabase
    .from("distance_prize_settings")
    .upsert(settingsRow, { onConflict: "distance_id" })
    .select("*")
    .single();
  if (settingsError) {
    await supabase.from("distance_prize_rules").delete().eq("distance_id", distanceId).eq("config_id", configId);
    return NextResponse.json({ ok: false, error: settingsError.message }, { status: 500 });
  }
  const previousConfigId = (previous as { current_config_id?: string } | null)?.current_config_id;
  if (previousConfigId && previousConfigId !== configId) {
    await supabase.from("distance_prize_rules").delete().eq("distance_id", distanceId).eq("config_id", previousConfigId);
  }

  return NextResponse.json({
    ok: true,
    settings,
    rules,
    requiresRepublish: Boolean(gated.resultsPublishedAt),
  });
}

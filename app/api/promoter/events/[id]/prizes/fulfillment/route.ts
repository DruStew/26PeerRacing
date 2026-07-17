import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["awaiting_pickup", "picked_up", "shipped", "delivered", "waived", "forfeited"]);

async function gate(eventId: string, distanceId: string, supabase: SupabaseClient) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  const { data: event } = await supabase.from("events").select("promoter_id").eq("id", eventId).maybeSingle();
  const { data: distance } = await supabase.from("distances").select("id").eq("id", distanceId).eq("event_id", eventId).maybeSingle();
  const { data: admin } = await supabase.from("roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!event || !distance) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Distance not found" }, { status: 404 }) };
  if ((event as { promoter_id: string }).promoter_id !== uid && !admin) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, uid };
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const distanceId = new URL(request.url).searchParams.get("distanceId")?.trim() ?? "";
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, distanceId, supabase);
  if (!gated.ok) return gated.response;
  const service = createServiceRoleSupabaseClient();
  if (!service) return NextResponse.json({ ok: false, error: "Server configuration error" }, { status: 503 });

  const { data: awards, error } = await service
    .from("published_prize_awards")
    .select("id,result_id,category,division,place,prize_name")
    .eq("event_id", eventId)
    .eq("distance_id", distanceId)
    .order("category")
    .order("division")
    .order("place");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const awardRows = (awards ?? []) as Array<{
    id: string;
    result_id: string;
    category: string;
    division: string;
    place: number;
    prize_name: string;
  }>;
  const awardIds = awardRows.map((award) => award.id);
  const resultIds = [...new Set(awardRows.map((award) => award.result_id))];
  const [{ data: fulfillment }, { data: results }] = await Promise.all([
    awardIds.length
      ? service.from("prize_award_fulfillment").select("award_id,status,fulfilled_at,note").in("award_id", awardIds)
      : Promise.resolve({ data: [] }),
    resultIds.length
      ? service.from("results").select("id,first_name,last_name,bib").in("id", resultIds)
      : Promise.resolve({ data: [] }),
  ]);
  const fulfillmentById = new Map(
    ((fulfillment ?? []) as Array<{ award_id: string; status: string; fulfilled_at: string | null; note: string | null }>).map(
      (row) => [row.award_id, row],
    ),
  );
  const resultById = new Map(
    ((results ?? []) as Array<{ id: string; first_name: string; last_name: string; bib: string | null }>).map(
      (row) => [row.id, row],
    ),
  );
  return NextResponse.json({
    ok: true,
    awards: awardRows.map((award) => ({
      ...award,
      racer: resultById.get(award.result_id) ?? null,
      ...(fulfillmentById.get(award.id) ?? { status: "awaiting_pickup", fulfilled_at: null, note: null }),
    })),
  });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  let body: { distance_id?: string; award_id?: string; status?: string; note?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const distanceId = String(body.distance_id ?? "").trim();
  const awardId = String(body.award_id ?? "").trim();
  const status = String(body.status ?? "");
  if (!distanceId || !awardId || !STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: "Invalid fulfillment update" }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, distanceId, supabase);
  if (!gated.ok) return gated.response;
  const service = createServiceRoleSupabaseClient();
  if (!service) return NextResponse.json({ ok: false, error: "Server configuration error" }, { status: 503 });
  const { data: award } = await service
    .from("published_prize_awards")
    .select("id")
    .eq("id", awardId)
    .eq("event_id", eventId)
    .eq("distance_id", distanceId)
    .maybeSingle();
  if (!award) return NextResponse.json({ ok: false, error: "Prize award not found" }, { status: 404 });

  const complete = status === "picked_up" || status === "shipped" || status === "delivered";
  const { error } = await service
    .from("prize_award_fulfillment")
    .update({
      status,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null,
      fulfilled_at: complete ? new Date().toISOString() : null,
      fulfilled_by: complete ? gated.uid : null,
      updated_at: new Date().toISOString(),
    })
    .eq("award_id", awardId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPromoterScopedRacerHistory } from "@/lib/promoter-racer-history";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/**
 * Promoter-scoped racer race history. A producer viewing one of their events can
 * see a finisher's results across THAT promoter's events only — never the racer's
 * full profile or results from other promoters' races.
 */
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
  const promoterId = (event as { promoter_id: string }).promoter_id;
  if (promoterId === uid) return { ok: true as const, promoterId };
  const { data: admin } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) return { ok: true as const, promoterId };
  return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; userId: string }> },
) {
  const { id: eventId, userId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const history = await loadPromoterScopedRacerHistory(service, gated.promoterId, userId);
  return NextResponse.json({ ok: true, ...history });
}

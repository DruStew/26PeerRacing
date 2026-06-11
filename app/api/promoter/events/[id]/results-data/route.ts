import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadFinishersForDistance } from "@/lib/results-console/finishers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

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

/** GET ?distanceId= — real finishers (matched import rows) ready for the console. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const distanceId = new URL(request.url).searchParams.get("distanceId")?.trim() ?? "";
  if (!distanceId) {
    return NextResponse.json({ ok: false, error: "Missing distanceId" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const { data: dist } = await service
    .from("distances")
    .select("id,results_published_at")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json({ ok: false, error: "Distance not found for this event." }, { status: 404 });
  }

  const { finishers, importedRowCount } = await loadFinishersForDistance(service, eventId, distanceId);

  const { count: registeredEntryCount } = await service
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("distance_id", distanceId);

  return NextResponse.json({
    ok: true,
    finishers,
    importedRowCount,
    registeredEntryCount: registeredEntryCount ?? 0,
    resultsPublishedAt: (dist as { results_published_at: string | null }).results_published_at,
  });
}

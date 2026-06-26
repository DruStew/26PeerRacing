import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  let body: {
    venue_name?: string | null;
    venue_address?: string | null;
    venue_lat?: number | null;
    venue_lng?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const lat = body.venue_lat == null ? null : Number(body.venue_lat);
  const lng = body.venue_lng == null ? null : Number(body.venue_lng);
  if (lat != null && (lat < -90 || lat > 90)) {
    return NextResponse.json({ ok: false, error: "Latitude out of range." }, { status: 400 });
  }
  if (lng != null && (lng < -180 || lng > 180)) {
    return NextResponse.json({ ok: false, error: "Longitude out of range." }, { status: 400 });
  }

  const { error } = await service
    .from("events")
    .update({
      venue_name: body.venue_name?.trim() || null,
      venue_address: body.venue_address?.trim() || null,
      venue_lat: lat,
      venue_lng: lng,
    })
    .eq("id", eventId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

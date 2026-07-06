import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const MAX_AID_STATIONS = 40;

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

function validCoord(lat: unknown, lng: unknown): { lat: number | null; lng: number | null } | null {
  const la = lat == null ? null : Number(lat);
  const ln = lng == null ? null : Number(lng);
  if (la != null && (Number.isNaN(la) || la < -90 || la > 90)) return null;
  if (ln != null && (Number.isNaN(ln) || ln < -180 || ln > 180)) return null;
  return { lat: la, lng: ln };
}

/**
 * PUT — save start location + replace this distance's aid stations in one call.
 */
export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string; distanceId: string }> },
) {
  const { id: eventId, distanceId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const { data: dist } = await service
    .from("distances")
    .select("id")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json({ ok: false, error: "Distance not found for this event." }, { status: 404 });
  }

  let body: {
    start_location_name?: string | null;
    start_location_address?: string | null;
    start_lat?: number | null;
    start_lng?: number | null;
    aid_stations?: Array<{
      name?: string;
      mile_marker?: string | null;
      lat?: number | null;
      lng?: number | null;
      drop_bags?: boolean;
    }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const startCoord = validCoord(body.start_lat, body.start_lng);
  if (!startCoord) {
    return NextResponse.json({ ok: false, error: "Start pin coordinates out of range." }, { status: 400 });
  }

  const stationsRaw = Array.isArray(body.aid_stations) ? body.aid_stations : [];
  if (stationsRaw.length > MAX_AID_STATIONS) {
    return NextResponse.json({ ok: false, error: `Too many aid stations (max ${MAX_AID_STATIONS}).` }, { status: 400 });
  }

  const stations: Array<{
    distance_id: string;
    name: string;
    mile_marker: string | null;
    lat: number | null;
    lng: number | null;
    drop_bags: boolean;
    sort_order: number;
  }> = [];
  for (let i = 0; i < stationsRaw.length; i++) {
    const s = stationsRaw[i]!;
    const name = String(s.name ?? "").trim().slice(0, 120);
    if (!name) {
      return NextResponse.json({ ok: false, error: `Aid station ${i + 1} is missing a name.` }, { status: 400 });
    }
    const coord = validCoord(s.lat, s.lng);
    if (!coord) {
      return NextResponse.json({ ok: false, error: `Aid station "${name}" has invalid coordinates.` }, { status: 400 });
    }
    stations.push({
      distance_id: distanceId,
      name,
      mile_marker: String(s.mile_marker ?? "").trim().slice(0, 40) || null,
      lat: coord.lat,
      lng: coord.lng,
      drop_bags: s.drop_bags === true,
      sort_order: i,
    });
  }

  const { error: updateErr } = await service
    .from("distances")
    .update({
      start_location_name: body.start_location_name?.trim() || null,
      start_location_address: body.start_location_address?.trim() || null,
      start_lat: startCoord.lat,
      start_lng: startCoord.lng,
    })
    .eq("id", distanceId)
    .eq("event_id", eventId);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  const { error: deleteErr } = await service.from("aid_stations").delete().eq("distance_id", distanceId);
  if (deleteErr) {
    return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });
  }

  if (stations.length > 0) {
    const { error: insertErr } = await service.from("aid_stations").insert(stations);
    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

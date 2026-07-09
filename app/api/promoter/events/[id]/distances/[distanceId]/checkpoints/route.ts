import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CHECKPOINT_AUDIO_BUCKET,
  MAX_CHECKPOINTS_PER_DISTANCE,
  newCheckpointToken,
  originFromRequest,
} from "@/lib/checkpoints/shared";
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

type CheckpointRow = {
  id: string;
  name: string;
  mile_marker: string | null;
  sort_order: number;
  audio_path: string | null;
  token: string;
  lat: number | null;
  lng: number | null;
  note: string | null;
};

function toClient(service: SupabaseClient, origin: string, row: CheckpointRow) {
  const audioUrl = row.audio_path
    ? service.storage.from(CHECKPOINT_AUDIO_BUCKET).getPublicUrl(row.audio_path).data.publicUrl
    : null;
  return {
    id: row.id,
    name: row.name,
    mile_marker: row.mile_marker,
    sort_order: row.sort_order,
    audio_url: audioUrl,
    scan_url: `${origin}/c/${row.token}`,
    lat: row.lat,
    lng: row.lng,
    note: row.note,
  };
}

async function listCheckpoints(service: SupabaseClient, distanceId: string): Promise<CheckpointRow[]> {
  const { data } = await service
    .from("qr_checkpoints")
    .select("id,name,mile_marker,sort_order,audio_path,token,lat,lng,note")
    .eq("distance_id", distanceId)
    .order("sort_order", { ascending: true });
  return (data ?? []) as CheckpointRow[];
}

function validCoord(lat: unknown, lng: unknown): { lat: number | null; lng: number | null } | null {
  const la = lat == null ? null : Number(lat);
  const ln = lng == null ? null : Number(lng);
  if (la != null && (Number.isNaN(la) || la < -90 || la > 90)) return null;
  if (ln != null && (Number.isNaN(ln) || ln < -180 || ln > 180)) return null;
  return { lat: la, lng: ln };
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string; distanceId: string }> }) {
  const { id: eventId, distanceId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const origin = originFromRequest(request);
  const rows = await listCheckpoints(service, distanceId);
  return NextResponse.json({ ok: true, checkpoints: rows.map((r) => toClient(service, origin, r)) });
}

/**
 * PUT — sync this distance's checkpoint list. Existing ids keep their token and
 * audio; removed checkpoints are deleted along with their audio file.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string; distanceId: string }> }) {
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
    checkpoints?: Array<{
      id?: string | null;
      name?: string;
      mile_marker?: string | null;
      lat?: number | null;
      lng?: number | null;
      note?: string | null;
    }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const incoming = Array.isArray(body.checkpoints) ? body.checkpoints : [];
  if (incoming.length > MAX_CHECKPOINTS_PER_DISTANCE) {
    return NextResponse.json(
      { ok: false, error: `Too many checkpoints (max ${MAX_CHECKPOINTS_PER_DISTANCE}).` },
      { status: 400 },
    );
  }

  const cleaned: Array<{
    id: string | null;
    name: string;
    mile_marker: string | null;
    lat: number | null;
    lng: number | null;
    note: string | null;
  }> = [];
  for (let i = 0; i < incoming.length; i++) {
    const c = incoming[i]!;
    const name = String(c.name ?? "").trim().slice(0, 120);
    if (!name) {
      return NextResponse.json({ ok: false, error: `Checkpoint ${i + 1} is missing a name.` }, { status: 400 });
    }
    const coord = validCoord(c.lat, c.lng);
    if (!coord) {
      return NextResponse.json({ ok: false, error: `Checkpoint "${name}" has invalid coordinates.` }, { status: 400 });
    }
    cleaned.push({
      id: c.id ? String(c.id) : null,
      name,
      mile_marker: String(c.mile_marker ?? "").trim().slice(0, 40) || null,
      lat: coord.lat,
      lng: coord.lng,
      note: String(c.note ?? "").trim().slice(0, 500) || null,
    });
  }

  const existing = await listCheckpoints(service, distanceId);
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const keptIds = new Set(cleaned.filter((c) => c.id).map((c) => c.id as string));

  // Delete removed checkpoints (scans cascade; audio removed from storage).
  const removed = existing.filter((r) => !keptIds.has(r.id));
  if (removed.length > 0) {
    const audioPaths = removed.map((r) => r.audio_path).filter((p): p is string => !!p);
    if (audioPaths.length > 0) {
      await service.storage.from(CHECKPOINT_AUDIO_BUCKET).remove(audioPaths);
    }
    const { error: delErr } = await service
      .from("qr_checkpoints")
      .delete()
      .in("id", removed.map((r) => r.id));
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }
  }

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i]!;
    if (c.id && existingById.has(c.id)) {
      const { error: upErr } = await service
        .from("qr_checkpoints")
        .update({ name: c.name, mile_marker: c.mile_marker, lat: c.lat, lng: c.lng, note: c.note, sort_order: i })
        .eq("id", c.id)
        .eq("distance_id", distanceId);
      if (upErr) {
        return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
      }
    } else {
      const { error: insErr } = await service.from("qr_checkpoints").insert({
        event_id: eventId,
        distance_id: distanceId,
        name: c.name,
        mile_marker: c.mile_marker,
        lat: c.lat,
        lng: c.lng,
        note: c.note,
        sort_order: i,
        token: newCheckpointToken(),
      });
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
    }
  }

  const origin = originFromRequest(request);
  const rows = await listCheckpoints(service, distanceId);
  return NextResponse.json({ ok: true, checkpoints: rows.map((r) => toClient(service, origin, r)) });
}

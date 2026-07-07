import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidCheckpointToken } from "@/lib/checkpoints/shared";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type EntryMatch = { id: string; first_name: string | null; last_name: string | null };

/** Match a typed bib to an entry in this event, preferring the checkpoint's distance. */
async function resolveEntryByBib(
  service: SupabaseClient,
  eventId: string,
  distanceId: string,
  bib: string,
): Promise<EntryMatch | null> {
  const { data } = await service
    .from("entries")
    .select("id,first_name,last_name,distance_id,bib,assigned_bib")
    .eq("event_id", eventId)
    .or(`assigned_bib.ilike.${bib},bib.ilike.${bib}`);
  const rows = (data ?? []) as Array<EntryMatch & { distance_id: string }>;
  if (rows.length === 0) return null;
  return rows.find((r) => r.distance_id === distanceId) ?? rows[0]!;
}

/**
 * POST — public "ping" when a runner scans a checkpoint QR.
 * Deduped per (checkpoint, device): re-scans update last-seen, never double-count.
 */
export async function POST(request: Request) {
  let body: { token?: string; deviceId?: string; bib?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  const deviceId = String(body.deviceId ?? "").trim();
  const bib = String(body.bib ?? "").trim().slice(0, 20);

  if (!isValidCheckpointToken(token)) {
    return NextResponse.json({ ok: false, error: "Invalid checkpoint." }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) {
    return NextResponse.json({ ok: false, error: "Invalid device." }, { status: 400 });
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 503 });
  }

  const { data: checkpoint } = await service
    .from("qr_checkpoints")
    .select("id,event_id,distance_id,name")
    .eq("token", token)
    .maybeSingle();
  if (!checkpoint) {
    return NextResponse.json({ ok: false, error: "Checkpoint not found." }, { status: 404 });
  }
  const cp = checkpoint as { id: string; event_id: string; distance_id: string; name: string };

  let entry: EntryMatch | null = null;
  if (bib) {
    entry = await resolveEntryByBib(service, cp.event_id, cp.distance_id, bib);
  }

  const { data: existing } = await service
    .from("checkpoint_scans")
    .select("id,scan_count,entry_id,bib")
    .eq("checkpoint_id", cp.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; scan_count: number; entry_id: string | null; bib: string | null };
    const { error } = await service
      .from("checkpoint_scans")
      .update({
        last_scanned_at: new Date().toISOString(),
        scan_count: row.scan_count + 1,
        // A bib typed later upgrades an earlier anonymous scan.
        ...(entry && !row.entry_id ? { entry_id: entry.id } : {}),
        ...(bib && !row.bib ? { bib } : {}),
      })
      .eq("id", row.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await service.from("checkpoint_scans").insert({
      checkpoint_id: cp.id,
      event_id: cp.event_id,
      distance_id: cp.distance_id,
      entry_id: entry?.id ?? null,
      bib: bib || null,
      device_id: deviceId,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    matched: !!entry,
    runnerName: entry ? `${entry.first_name ?? ""} ${entry.last_name ?? ""}`.trim() || null : null,
  });
}

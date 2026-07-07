import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/**
 * GET — live checkpoint progress board data.
 * Public when the promoter has flipped the event's board to public;
 * otherwise promoter/admin only.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 503 });
  }

  const { data: eventRaw } = await service
    .from("events")
    .select("id,name,promoter_id,checkpoint_scans_public")
    .eq("id", eventId)
    .maybeSingle();
  if (!eventRaw) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }
  const event = eventRaw as {
    id: string;
    name: string;
    promoter_id: string;
    checkpoint_scans_public: boolean;
  };

  // Managers (promoter/admin) always have access and additionally see guests;
  // the public view (when enabled) shows entered racers only.
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  let isManager = uid === event.promoter_id;
  if (!isManager && uid) {
    const { data: admin } = await supabase
      .from("roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    isManager = !!admin;
  }
  if (!event.checkpoint_scans_public && !isManager) {
    return NextResponse.json({ ok: false, error: "This board is not public." }, { status: 403 });
  }

  const [{ data: distancesRaw }, { data: checkpointsRaw }, { data: scansRaw }] = await Promise.all([
    service.from("distances").select("id,label,race_name").eq("event_id", eventId),
    service
      .from("qr_checkpoints")
      .select("id,distance_id,name,mile_marker,sort_order")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true }),
    service
      .from("checkpoint_scans")
      .select("checkpoint_id,distance_id,entry_id,bib,device_id,first_scanned_at")
      .eq("event_id", eventId)
      .order("first_scanned_at", { ascending: true }),
  ]);

  const scans = (scansRaw ?? []) as Array<{
    checkpoint_id: string;
    distance_id: string;
    entry_id: string | null;
    bib: string | null;
    device_id: string;
    first_scanned_at: string;
  }>;

  // Resolve runner names for matched scans.
  const entryIds = [...new Set(scans.map((s) => s.entry_id).filter((x): x is string => !!x))];
  const entryById = new Map<string, { name: string; bib: string | null }>();
  if (entryIds.length > 0) {
    const { data: entriesRaw } = await service
      .from("entries")
      .select("id,first_name,last_name,bib,assigned_bib")
      .in("id", entryIds);
    for (const e of (entriesRaw ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      bib: string | null;
      assigned_bib: string | null;
    }>) {
      entryById.set(e.id, {
        name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "(no name)",
        bib: e.assigned_bib?.trim() || e.bib?.trim() || null,
      });
    }
  }

  // One board row per person: entry when matched, else bib text, else device.
  // Roster-matched rows are "racers"; everything else is a trail-side guest.
  type Row = {
    key: string;
    name: string;
    bib: string | null;
    matched: boolean;
    anonymous: boolean;
    scans: Record<string, string>; // checkpoint_id -> first_scanned_at
    lastSeenAt: string;
    lastSeenCheckpointId: string;
    distanceIds: Set<string>;
  };
  const rows = new Map<string, Row>();
  for (const s of scans) {
    const key = s.entry_id ?? (s.bib ? `bib:${s.bib.toLowerCase()}` : `dev:${s.device_id}`);
    let row = rows.get(key);
    if (!row) {
      const entry = s.entry_id ? entryById.get(s.entry_id) : null;
      row = {
        key,
        name: entry?.name ?? (s.bib ? `Bib ${s.bib} (not on roster)` : "Anonymous guest"),
        bib: entry?.bib ?? s.bib,
        matched: !!s.entry_id,
        anonymous: !s.entry_id && !s.bib,
        scans: {},
        lastSeenAt: s.first_scanned_at,
        lastSeenCheckpointId: s.checkpoint_id,
        distanceIds: new Set(),
      };
      rows.set(key, row);
    }
    if (!row.scans[s.checkpoint_id] || s.first_scanned_at < row.scans[s.checkpoint_id]!) {
      row.scans[s.checkpoint_id] = s.first_scanned_at;
    }
    if (s.first_scanned_at >= row.lastSeenAt) {
      row.lastSeenAt = s.first_scanned_at;
      row.lastSeenCheckpointId = s.checkpoint_id;
    }
    row.distanceIds.add(s.distance_id);
  }

  const sortedRows = [...rows.values()].sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
  const racerRows = sortedRows.filter((r) => r.matched);
  const guestRows = sortedRows.filter((r) => !r.matched);

  return NextResponse.json({
    ok: true,
    eventName: event.name,
    isPublic: event.checkpoint_scans_public,
    distances: ((distancesRaw ?? []) as Array<{ id: string; label: string; race_name: string | null }>).map(
      (d) => ({
        id: d.id,
        label: d.race_name ? `${d.race_name} — ${d.label}` : d.label,
      }),
    ),
    checkpoints: ((checkpointsRaw ?? []) as Array<{
      id: string;
      distance_id: string;
      name: string;
      mile_marker: string | null;
      sort_order: number;
    }>).map((c) => ({
      id: c.id,
      distance_id: c.distance_id,
      name: c.name,
      mile_marker: c.mile_marker,
    })),
    racers: racerRows.map((r) => ({
      key: r.key,
      name: r.name,
      bib: r.bib,
      scans: r.scans,
      lastSeenAt: r.lastSeenAt,
      lastSeenCheckpointId: r.lastSeenCheckpointId,
      distanceIds: [...r.distanceIds],
    })),
    // Guests (unmatched bibs, anonymous scans) are promoter-only.
    guests: isManager
      ? guestRows.map((r) => ({
          key: r.key,
          name: r.name,
          bib: r.bib,
          anonymous: r.anonymous,
          scans: r.scans,
          lastSeenAt: r.lastSeenAt,
          lastSeenCheckpointId: r.lastSeenCheckpointId,
        }))
      : null,
  });
}

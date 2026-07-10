import { NextResponse } from "next/server";

import { gateTimingApi } from "@/lib/timing/server";

export const dynamic = "force-dynamic";

/**
 * GET — polled by Race Control: sessions, gun marks, and all non-dismissed
 * finish events for this event, plus the big-screen toggle state and the
 * server clock (piggybacked so pollers can keep their offset fresh).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const gated = await gateTimingApi(request, eventId);
  if (!gated.ok) return gated.response;
  const service = gated.service;

  const [{ data: event }, { data: sessions }, { data: events }, { data: clocks }, { data: dnfs }, { data: checkedIn }] =
    await Promise.all([
      service.from("events").select("big_screen_public").eq("id", eventId).maybeSingle(),
      service
        .from("timing_sessions")
        .select("id,label,status,created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(10),
      service
        .from("timing_finish_events")
        .select("id,session_id,distance_id,entry_id,tag_id,crossed_at,elapsed_ms,source,status,detail")
        .eq("event_id", eventId)
        .neq("status", "dismissed")
        .order("crossed_at", { ascending: true })
        .limit(1000),
      service
        .from("timing_race_clocks")
        .select("distance_id,stopped_at")
        .eq("event_id", eventId),
      service.from("timing_dnf").select("entry_id").eq("event_id", eventId),
      service
        .from("entries")
        .select("id")
        .eq("event_id", eventId)
        .not("kiosk_checked_in_at", "is", null)
        .limit(2000),
    ]);

  const sessionIds = (sessions ?? []).map((s) => (s as { id: string }).id);
  const { data: guns } = sessionIds.length
    ? await service
        .from("timing_gun_marks")
        .select("session_id,distance_id,gun_at")
        .in("session_id", sessionIds)
    : { data: [] };

  return NextResponse.json(
    {
      ok: true,
      server_ms: Date.now(),
      big_screen_public: (event as { big_screen_public?: boolean } | null)?.big_screen_public === true,
      sessions: sessions ?? [],
      gun_marks: guns ?? [],
      events: events ?? [],
      clock_stops: clocks ?? [],
      dnf_entry_ids: ((dnfs ?? []) as { entry_id: string }[]).map((d) => d.entry_id),
      checked_in_entry_ids: ((checkedIn ?? []) as { id: string }[]).map((e) => e.id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

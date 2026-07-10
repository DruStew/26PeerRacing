import { NextResponse } from "next/server";

import { gateTimingApi, writeProvisionalFinishTime } from "@/lib/timing/server";
import { formatMs } from "@/lib/results-import/parse";

export const dynamic = "force-dynamic";

/**
 * PATCH — review actions on one finish event:
 *   { action: "confirm", entry_id, crossed_at_ms? }  → elapsed vs gun mark → results_raw
 *   { action: "dismiss" }
 *   { action: "update", crossed_at_ms }              → adjust proposed crossing
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; feId: string }> },
) {
  const { id: eventId, feId } = await ctx.params;
  const gated = await gateTimingApi(request, eventId);
  if (!gated.ok) return gated.response;
  const service = gated.service;

  let body: { action?: string; entry_id?: string; crossed_at_ms?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { data: fe } = await service
    .from("timing_finish_events")
    .select("id,session_id,event_id,entry_id,distance_id,tag_id,crossed_at,status")
    .eq("id", feId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!fe) {
    return NextResponse.json({ ok: false, error: "Finish event not found." }, { status: 404 });
  }
  const row = fe as {
    id: string;
    session_id: string;
    entry_id: string | null;
    distance_id: string | null;
    crossed_at: string;
    status: string;
  };

  const action = String(body.action ?? "");

  if (action === "dismiss") {
    const { error } = await service
      .from("timing_finish_events")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", feId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "update") {
    const crossedAtMs = Number(body.crossed_at_ms);
    if (!Number.isFinite(crossedAtMs) || crossedAtMs <= 0) {
      return NextResponse.json({ ok: false, error: "Provide crossed_at_ms." }, { status: 400 });
    }
    const { error } = await service
      .from("timing_finish_events")
      .update({
        crossed_at: new Date(crossedAtMs).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", feId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "confirm") {
    const entryId = String(body.entry_id ?? "").trim() || row.entry_id;
    if (!entryId) {
      return NextResponse.json(
        { ok: false, error: "Assign a runner before confirming." },
        { status: 400 },
      );
    }

    const { data: entry } = await service
      .from("entries")
      .select("id,distance_id")
      .eq("id", entryId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!entry) {
      return NextResponse.json({ ok: false, error: "Entry not found." }, { status: 404 });
    }
    const distanceId = (entry as { distance_id: string }).distance_id;

    // The gun is a race-level fact: the laptop (Race Control) and the phone
    // (Finish Cam) each run their own session, so look across every session
    // of this event and take the latest gun for the runner's distance.
    const { data: sessionRows } = await service
      .from("timing_sessions")
      .select("id")
      .eq("event_id", eventId);
    const sessionIds = ((sessionRows ?? []) as { id: string }[]).map((s) => s.id);
    const { data: gun } = sessionIds.length
      ? await service
          .from("timing_gun_marks")
          .select("gun_at")
          .in("session_id", sessionIds)
          .eq("distance_id", distanceId)
          .order("gun_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
    if (!gun) {
      return NextResponse.json(
        { ok: false, error: "No gun mark for this runner's distance — fire the GUN mark first (you can set it retroactively on the capture page)." },
        { status: 400 },
      );
    }

    const crossedAtMs = Number.isFinite(Number(body.crossed_at_ms))
      ? Number(body.crossed_at_ms)
      : new Date(row.crossed_at).getTime();
    const gunAtMs = new Date((gun as { gun_at: string }).gun_at).getTime();
    const elapsedMs = crossedAtMs - gunAtMs;
    if (elapsedMs <= 0) {
      return NextResponse.json(
        { ok: false, error: "Crossing is before the gun — check the gun mark." },
        { status: 400 },
      );
    }

    const wrote = await writeProvisionalFinishTime(service, {
      eventId,
      entryId,
      timeMs: elapsedMs,
      sourceLabel: "camera:finish-cam",
    });
    if (!wrote.ok) {
      return NextResponse.json({ ok: false, error: wrote.error }, { status: 500 });
    }

    const { error } = await service
      .from("timing_finish_events")
      .update({
        status: "confirmed",
        entry_id: entryId,
        distance_id: distanceId,
        crossed_at: new Date(crossedAtMs).toISOString(),
        elapsed_ms: elapsedMs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", feId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsedMs,
      elapsed_display: formatMs(elapsedMs),
    });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}

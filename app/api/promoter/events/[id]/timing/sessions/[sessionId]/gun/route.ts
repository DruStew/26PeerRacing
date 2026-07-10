import { NextResponse } from "next/server";

import { gateTimingApi } from "@/lib/timing/server";

export const dynamic = "force-dynamic";

/**
 * POST { distance_id, gun_at_ms } — record (or correct) the gun moment for a
 * distance on this session's clock. gun_at_ms is server-clock epoch millis
 * (the capture page applies its measured offset before sending).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id: eventId, sessionId } = await ctx.params;
  const gated = await gateTimingApi(request, eventId);
  if (!gated.ok) return gated.response;

  let body: { distance_id?: string; gun_at_ms?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const distanceId = String(body.distance_id ?? "").trim();
  const gunAtMs = Number(body.gun_at_ms);
  if (!distanceId || !Number.isFinite(gunAtMs) || gunAtMs <= 0) {
    return NextResponse.json({ ok: false, error: "Provide distance_id and gun_at_ms." }, { status: 400 });
  }

  // Session must belong to this event (defense against cross-event writes).
  const { data: session } = await gated.service
    .from("timing_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  const { error } = await gated.service.from("timing_gun_marks").upsert(
    {
      session_id: sessionId,
      distance_id: distanceId,
      gun_at: new Date(gunAtMs).toISOString(),
    },
    { onConflict: "session_id,distance_id" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

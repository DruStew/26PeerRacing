import { NextResponse } from "next/server";

import { gateTimingApi } from "@/lib/timing/server";

export const dynamic = "force-dynamic";

/**
 * POST { distance_id, action: "stop" | "resume", stopped_at_ms? } — stop or
 * resume a distance's race clock. Stopping freezes the Race Control / big
 * screen clocks; crossings can still be reviewed and confirmed afterwards.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const gated = await gateTimingApi(request, eventId);
  if (!gated.ok) return gated.response;

  let body: { distance_id?: string; action?: string; stopped_at_ms?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const distanceId = String(body.distance_id ?? "").trim();
  const action = String(body.action ?? "");
  if (!distanceId || (action !== "stop" && action !== "resume")) {
    return NextResponse.json(
      { ok: false, error: "Provide distance_id and action stop|resume." },
      { status: 400 },
    );
  }

  const { data: distance } = await gated.service
    .from("distances")
    .select("id")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!distance) {
    return NextResponse.json({ ok: false, error: "Distance not found." }, { status: 404 });
  }

  const stoppedAt =
    action === "stop"
      ? new Date(
          Number.isFinite(Number(body.stopped_at_ms)) && Number(body.stopped_at_ms) > 0
            ? Number(body.stopped_at_ms)
            : Date.now(),
        ).toISOString()
      : null;

  const { error } = await gated.service.from("timing_race_clocks").upsert(
    {
      event_id: eventId,
      distance_id: distanceId,
      stopped_at: stoppedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,distance_id" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, stopped_at: stoppedAt });
}

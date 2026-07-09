import { NextResponse } from "next/server";

import { gateTimingApi } from "@/lib/timing/server";

export const dynamic = "force-dynamic";

/** PATCH { end?: true, clock_offset_ms? } — end a session / update its clock offset. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id: eventId, sessionId } = await ctx.params;
  const gated = await gateTimingApi(eventId);
  if (!gated.ok) return gated.response;

  let body: { end?: boolean; clock_offset_ms?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.end === true) {
    patch.status = "ended";
    patch.ended_at = new Date().toISOString();
  }
  const offset = Number(body.clock_offset_ms);
  if (Number.isFinite(offset)) patch.clock_offset_ms = Math.round(offset);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await gated.service
    .from("timing_sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("event_id", eventId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

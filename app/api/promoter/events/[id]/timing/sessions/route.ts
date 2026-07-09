import { NextResponse } from "next/server";

import { gateTimingApi } from "@/lib/timing/server";

export const dynamic = "force-dynamic";

/** GET — list this event's capture sessions (newest first). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const gated = await gateTimingApi(eventId);
  if (!gated.ok) return gated.response;

  const { data, error } = await gated.service
    .from("timing_sessions")
    .select("id,label,status,clock_offset_ms,created_at,ended_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sessions: data ?? [] });
}

/** POST { label?, clock_offset_ms? } — start a new capture session. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const gated = await gateTimingApi(eventId);
  if (!gated.ok) return gated.response;

  let body: { label?: string; clock_offset_ms?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const offset = Number(body.clock_offset_ms);
  const { data, error } = await gated.service
    .from("timing_sessions")
    .insert({
      event_id: eventId,
      label: String(body.label ?? "").trim().slice(0, 80) || "Finish line",
      clock_offset_ms: Number.isFinite(offset) ? Math.round(offset) : null,
      created_by: gated.userId,
    })
    .select("id,label,status,clock_offset_ms,created_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Could not create session." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, session: data });
}

import { NextResponse } from "next/server";

import { gateTimingApi } from "@/lib/timing/server";

export const dynamic = "force-dynamic";

/**
 * POST { entry_id, action: "mark" | "unmark" } — mark a runner DNF (did not
 * finish) or undo it. DNF runners drop off the "still on course" roster.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const gated = await gateTimingApi(request, eventId);
  if (!gated.ok) return gated.response;

  let body: { entry_id?: string; action?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const entryId = String(body.entry_id ?? "").trim();
  const action = String(body.action ?? "");
  if (!entryId || (action !== "mark" && action !== "unmark")) {
    return NextResponse.json(
      { ok: false, error: "Provide entry_id and action mark|unmark." },
      { status: 400 },
    );
  }

  const { data: entry } = await gated.service
    .from("entries")
    .select("id,distance_id")
    .eq("id", entryId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Entry not found." }, { status: 404 });
  }

  if (action === "mark") {
    const { error } = await gated.service.from("timing_dnf").upsert(
      {
        event_id: eventId,
        entry_id: entryId,
        distance_id: (entry as { distance_id: string }).distance_id,
        marked_at: new Date().toISOString(),
      },
      { onConflict: "event_id,entry_id" },
    );
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    const { error } = await gated.service
      .from("timing_dnf")
      .delete()
      .eq("event_id", eventId)
      .eq("entry_id", entryId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

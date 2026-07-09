import { NextResponse } from "next/server";

import { gateTimingApi } from "@/lib/timing/server";

export const dynamic = "force-dynamic";

type IncomingEvent = {
  tag_id?: number | null;
  crossed_at_ms?: number;
  source?: string;
  detail?: Record<string, unknown>;
};

const SOURCES = new Set(["tag", "mark", "motion", "manual"]);

/**
 * POST { events: [...] } — ingest crossings from the capture page (batched,
 * retried offline-first). Tag crossings dedupe per (session, tag): the first
 * reported crossing wins, later re-detections are ignored.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id: eventId, sessionId } = await ctx.params;
  const gated = await gateTimingApi(eventId);
  if (!gated.ok) return gated.response;

  let body: { events?: IncomingEvent[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const incoming = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
  if (incoming.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const { data: session } = await gated.service
    .from("timing_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  const cleaned = incoming
    .map((e) => {
      const crossedAtMs = Number(e.crossed_at_ms);
      const source = SOURCES.has(String(e.source)) ? String(e.source) : "manual";
      const tagIdNum = Number(e.tag_id);
      const tagId = Number.isInteger(tagIdNum) && tagIdNum >= 0 ? tagIdNum : null;
      if (!Number.isFinite(crossedAtMs) || crossedAtMs <= 0) return null;
      return {
        session_id: sessionId,
        event_id: eventId,
        tag_id: tagId,
        crossed_at: new Date(crossedAtMs).toISOString(),
        source,
        detail: (e.detail && typeof e.detail === "object" ? e.detail : {}) as Record<string, unknown>,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  // Pre-fill runner identity from tag bindings so review is one click.
  const tagIds = [...new Set(cleaned.map((e) => e.tag_id).filter((t): t is number => t !== null))];
  const bindingByTag = new Map<number, { entry_id: string; distance_id: string | null }>();
  if (tagIds.length > 0) {
    const { data: bindings } = await gated.service
      .from("timing_tags")
      .select("tag_id,entry_id,entries(distance_id)")
      .eq("event_id", eventId)
      .in("tag_id", tagIds);
    for (const b of bindings ?? []) {
      const row = b as unknown as {
        tag_id: number;
        entry_id: string;
        entries: { distance_id: string | null } | null;
      };
      bindingByTag.set(row.tag_id, {
        entry_id: row.entry_id,
        distance_id: row.entries?.distance_id ?? null,
      });
    }
  }

  let inserted = 0;
  for (const e of cleaned) {
    const binding = e.tag_id !== null ? bindingByTag.get(e.tag_id) : undefined;
    const { error } = await gated.service.from("timing_finish_events").insert({
      ...e,
      entry_id: binding?.entry_id ?? null,
      distance_id: binding?.distance_id ?? null,
    });
    if (!error) {
      inserted += 1;
    } else if (!error.message.includes("timing_finish_events_tag_uidx")) {
      // Duplicate tag crossings are expected (first wins); anything else is real.
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, inserted });
}

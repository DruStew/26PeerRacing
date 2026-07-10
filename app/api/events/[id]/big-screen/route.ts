import { NextResponse } from "next/server";

import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/**
 * GET — data feed for the big-screen live results page (polled ~5s).
 *
 * Public when events.big_screen_public is on; otherwise promoter-only
 * (preview mode). Live finishers come from the provisional results pool
 * (results_raw), so camera-confirmed, hand-typed and CSV times all show.
 * Published distances switch to official results (division, place, money).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server misconfigured." }, { status: 503 });
  }

  const { data: event } = await service
    .from("events")
    .select("id,name,big_screen_public,promoter_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  const ev = event as {
    id: string;
    name: string;
    big_screen_public: boolean;
    promoter_id: string | null;
  };

  if (!ev.big_screen_public) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await canManageEvent(supabase, user.id, ev.promoter_id))) {
      return NextResponse.json({ ok: false, error: "This board is not public." }, { status: 403 });
    }
  }

  const [{ data: distRaw }, { data: entriesRaw }, { data: rawRows }, { data: sessionsRaw }] =
    await Promise.all([
      service
        .from("distances")
        .select("id,label,results_published_at")
        .eq("event_id", eventId)
        .order("sort_order"),
      service
        .from("entries")
        .select("id,first_name,last_name,assigned_bib,bib,distance_id")
        .eq("event_id", eventId),
      service
        .from("results_raw")
        .select("matched_entry_id,distance_id,row_json,imported_at")
        .eq("event_id", eventId)
        .eq("match_status", "matched"),
      service
        .from("timing_sessions")
        .select("id")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const distances = (distRaw ?? []) as { id: string; label: string; results_published_at: string | null }[];
  const entries = (entriesRaw ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    assigned_bib: string | null;
    bib: string | null;
    distance_id: string;
  }[];
  const entryById = new Map(entries.map((e) => [e.id, e]));

  // Latest gun mark per distance (drives countdown + race clocks).
  const sessionIds = (sessionsRaw ?? []).map((s) => (s as { id: string }).id);
  const gunByDistance: Record<string, number> = {};
  if (sessionIds.length > 0) {
    const { data: guns } = await service
      .from("timing_gun_marks")
      .select("distance_id,gun_at,created_at")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: true });
    for (const g of guns ?? []) {
      const row = g as { distance_id: string; gun_at: string };
      gunByDistance[row.distance_id] = new Date(row.gun_at).getTime();
    }
  }

  // Live (provisional) finishers.
  const liveFinishers = ((rawRows ?? []) as {
    matched_entry_id: string | null;
    distance_id: string | null;
    row_json: { parsed?: { time_ms?: number | null; time_display?: string | null } } | null;
    imported_at: string | null;
  }[])
    .map((r) => {
      const entry = r.matched_entry_id ? entryById.get(r.matched_entry_id) : null;
      const timeMs = r.row_json?.parsed?.time_ms;
      if (!entry || typeof timeMs !== "number" || timeMs <= 0) return null;
      return {
        entry_id: entry.id,
        distance_id: entry.distance_id,
        name: [entry.first_name, entry.last_name].filter(Boolean).join(" "),
        bib: entry.assigned_bib?.trim() || entry.bib?.trim() || null,
        time_ms: timeMs,
        time_display: r.row_json?.parsed?.time_display ?? null,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .sort((a, b) => a.time_ms - b.time_ms);

  // Official results for published distances.
  const publishedDistanceIds = distances.filter((d) => d.results_published_at).map((d) => d.id);
  let official: {
    distance_id: string;
    name: string;
    bib: string | null;
    finish_time_ms: number;
    overall_rank: number | null;
    division: string | null;
    division_place: number | null;
    payout_cents: number | null;
  }[] = [];
  if (publishedDistanceIds.length > 0) {
    const { data: results } = await service
      .from("results")
      .select(
        "distance_id,first_name,last_name,bib,finish_time_ms,overall_rank,division,division_place,payout_cents",
      )
      .eq("event_id", eventId)
      .eq("published", true)
      .in("distance_id", publishedDistanceIds)
      .order("overall_rank", { ascending: true });
    official = ((results ?? []) as {
      distance_id: string;
      first_name: string;
      last_name: string;
      bib: string | null;
      finish_time_ms: number;
      overall_rank: number | null;
      division: string | null;
      division_place: number | null;
      payout_cents: number | null;
    }[]).map((r) => ({
      distance_id: r.distance_id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      bib: r.bib,
      finish_time_ms: r.finish_time_ms,
      overall_rank: r.overall_rank,
      division: r.division,
      division_place: r.division_place,
      payout_cents: r.payout_cents,
    }));
  }

  return NextResponse.json(
    {
      ok: true,
      server_ms: Date.now(),
      event_name: ev.name,
      distances: distances.map((d) => ({
        id: d.id,
        label: d.label,
        published: d.results_published_at !== null,
        gun_at_ms: gunByDistance[d.id] ?? null,
      })),
      roster: entries.map((e) => ({
        distance_id: e.distance_id,
        name: [e.first_name, e.last_name].filter(Boolean).join(" "),
        bib: e.assigned_bib?.trim() || e.bib?.trim() || null,
      })),
      live_finishers: liveFinishers,
      official_results: official,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

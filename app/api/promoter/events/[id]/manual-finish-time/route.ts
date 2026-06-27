import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMs, parseTimeToMs } from "@/lib/results-import/parse";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

async function gate(eventId: string, supabase: SupabaseClient) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: event, error } = await supabase
    .from("events")
    .select("id,promoter_id")
    .eq("id", eventId)
    .single();
  if (error || !event) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 }) };
  }
  if ((event as { promoter_id: string }).promoter_id === uid) return { ok: true as const };
  const { data: admin } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) return { ok: true as const };
  return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
}

/** POST { entryId, time } — save a manual finish time for results import / console. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  let body: { entryId?: string; time?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const entryId = String(body.entryId ?? "").trim();
  const timeRaw = String(body.time ?? "").trim();
  if (!entryId || !timeRaw) {
    return NextResponse.json({ ok: false, error: "Provide entryId and time." }, { status: 400 });
  }

  const timeMs = parseTimeToMs(timeRaw);
  if (timeMs === null) {
    return NextResponse.json(
      { ok: false, error: 'Could not parse time. Use formats like "23:45", "1:23:45", or seconds.' },
      { status: 400 },
    );
  }

  const { data: entry } = await service
    .from("entries")
    .select("id,distance_id,first_name,last_name,bib,assigned_bib,user_id")
    .eq("id", entryId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Entry not found." }, { status: 404 });
  }

  const row = entry as {
    id: string;
    distance_id: string;
    first_name: string;
    last_name: string;
    bib: string | null;
    assigned_bib: string | null;
    user_id: string | null;
  };

  let prId: string | null = null;
  if (row.user_id) {
    const { data: profile } = await service.from("profiles").select("pr_id").eq("id", row.user_id).maybeSingle();
    prId = (profile as { pr_id?: string | null } | null)?.pr_id?.trim() || null;
  }

  const timeDisplay = formatMs(timeMs);
  const parsed = {
    row_num: 0,
    bib: row.assigned_bib?.trim() || row.bib?.trim() || null,
    pr_id: prId,
    first_name: row.first_name,
    last_name: row.last_name,
    time_ms: timeMs,
    time_display: timeDisplay,
    match_method: "manual_roster",
    note: null,
  };

  const { data: existing } = await service
    .from("results_raw")
    .select("id,row_json")
    .eq("event_id", eventId)
    .eq("matched_entry_id", entryId)
    .maybeSingle();

  if (existing) {
    const prevJson = (existing as { row_json?: Record<string, unknown> }).row_json ?? {};
    const { error } = await service
      .from("results_raw")
      .update({
        match_status: "matched",
        distance_id: row.distance_id,
        row_json: { ...prevJson, parsed },
      })
      .eq("id", (existing as { id: string }).id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    const { error } = await service.from("results_raw").insert({
      event_id: eventId,
      distance_id: row.distance_id,
      matched_entry_id: entryId,
      match_status: "matched",
      source_filename: "manual:roster",
      row_json: { raw: {}, parsed },
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    finish_time_ms: timeMs,
    finish_time_display: timeDisplay,
  });
}

/** DELETE ?entryId= — remove a manually entered finish time. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const entryId = new URL(request.url).searchParams.get("entryId")?.trim() ?? "";
  if (!entryId) {
    return NextResponse.json({ ok: false, error: "Missing entryId." }, { status: 400 });
  }

  const { error } = await service
    .from("results_raw")
    .delete()
    .eq("event_id", eventId)
    .eq("matched_entry_id", entryId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

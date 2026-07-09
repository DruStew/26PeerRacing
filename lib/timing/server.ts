import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMs } from "@/lib/results-import/parse";
import { loadEventForPromoterTools } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

/** Shared gate for timing APIs: event promoter/admin + service client. */
export async function gateTimingApi(eventId: string): Promise<
  | { ok: true; service: SupabaseClient; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  const loaded = await loadEventForPromoterTools(supabase, user.id, eventId, "id,promoter_id");
  if (!loaded.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: loaded.reason === "not_found" ? "Event not found" : "Forbidden" },
        { status: loaded.reason === "not_found" ? 404 : 403 },
      ),
    };
  }
  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 },
      ),
    };
  }
  return { ok: true, service, userId: user.id };
}

/**
 * Write a provisional finish time into results_raw — the exact shape the
 * manual-roster entry and CSV import produce, so the results console,
 * publish flow, and payouts see camera times as just another source.
 */
export async function writeProvisionalFinishTime(
  service: SupabaseClient,
  args: { eventId: string; entryId: string; timeMs: number; sourceLabel?: string },
): Promise<{ ok: true; timeDisplay: string } | { ok: false; error: string }> {
  const { eventId, entryId, timeMs } = args;

  const { data: entry } = await service
    .from("entries")
    .select("id,distance_id,first_name,last_name,bib,assigned_bib,user_id")
    .eq("id", entryId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!entry) return { ok: false, error: "Entry not found." };

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
    const { data: profile } = await service
      .from("profiles")
      .select("pr_id")
      .eq("id", row.user_id)
      .maybeSingle();
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
    match_method: "camera_timing",
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
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await service.from("results_raw").insert({
      event_id: eventId,
      distance_id: row.distance_id,
      matched_entry_id: entryId,
      match_status: "matched",
      source_filename: args.sourceLabel ?? "camera:finish-cam",
      row_json: { raw: {}, parsed },
    });
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, timeDisplay };
}

import { NextResponse } from "next/server";
import Papa from "papaparse";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  matchRowsToEntries,
  parseFinishRows,
  type MatchableEntry,
  type RawCsvRow,
} from "@/lib/results-import/parse";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ROWS = 5000;
const WRITE_CHUNK = 200;

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

async function loadMatchableEntries(
  service: SupabaseClient,
  eventId: string,
  distanceId: string,
): Promise<MatchableEntry[]> {
  const { data: entries } = await service
    .from("entries")
    .select("id,user_id,first_name,last_name,bib,assigned_bib")
    .eq("event_id", eventId)
    .eq("distance_id", distanceId);

  const rows = (entries ?? []) as Array<{
    id: string;
    user_id: string | null;
    first_name: string;
    last_name: string;
    bib: string | null;
    assigned_bib: string | null;
  }>;

  const userIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))];
  const prIdByUser = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += 500) {
    const chunk = userIds.slice(i, i + 500);
    const { data: profiles } = await service.from("profiles").select("id,pr_id").in("id", chunk);
    for (const p of (profiles ?? []) as Array<{ id: string; pr_id: string | null }>) {
      if (p.pr_id?.trim()) prIdByUser.set(p.id, p.pr_id.trim());
    }
  }

  return rows.map((r) => ({
    ...r,
    pr_id: r.user_id ? (prIdByUser.get(r.user_id) ?? null) : null,
  }));
}

function summarize(rows: Array<{ match_status: string }>) {
  let matched = 0;
  let unmatched = 0;
  let ignored = 0;
  for (const r of rows) {
    if (r.match_status === "matched") matched += 1;
    else if (r.match_status === "ignored") ignored += 1;
    else unmatched += 1;
  }
  return { total: rows.length, matched, unmatched, ignored };
}

/** GET ?distanceId= — current import state plus entries for the manual-match picker. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const distanceId = new URL(request.url).searchParams.get("distanceId")?.trim() ?? "";
  if (!distanceId) {
    return NextResponse.json({ ok: false, error: "Missing distanceId" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const { data: rawRows, error } = await service
    .from("results_raw")
    .select("id,row_json,match_status,matched_entry_id,import_batch,source_filename,imported_at")
    .eq("event_id", eventId)
    .eq("distance_id", distanceId)
    .order("imported_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const entries = await loadMatchableEntries(service, eventId, distanceId);

  return NextResponse.json({
    ok: true,
    rows: rawRows ?? [],
    entries,
    summary: summarize((rawRows ?? []) as Array<{ match_status: string }>),
  });
}

/** POST formData(distance_id, file) — replaces any prior import for the distance. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const distanceId = String(form.get("distance_id") ?? "").trim();
  const file = form.get("file");
  if (!distanceId) {
    return NextResponse.json({ ok: false, error: "Select a distance." }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "Attach a CSV file." }, { status: 400 });
  }

  const { data: dist } = await service
    .from("distances")
    .select("id")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json({ ok: false, error: "Distance not found for this event." }, { status: 404 });
  }

  let text: string;
  try {
    text = await (file as File).text();
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the file." }, { status: 400 });
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const parsed = Papa.parse<RawCsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => String(h).trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!;
    return NextResponse.json(
      { ok: false, error: `CSV parse error: ${first.message} (row ${first.row})` },
      { status: 400 },
    );
  }

  const rawRows = parsed.data.filter((r) =>
    Object.keys(r).some((k) => String(r[k] ?? "").trim() !== ""),
  );
  if (rawRows.length === 0) {
    return NextResponse.json({ ok: false, error: "No data rows in CSV." }, { status: 400 });
  }
  if (rawRows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `Too many rows (${rawRows.length}). Maximum is ${MAX_ROWS}.` },
      { status: 400 },
    );
  }

  const headers = (parsed.meta.fields ?? []).map((h) => String(h));
  const { columns, rows } = parseFinishRows(rawRows, headers);
  if (!columns.time) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No time column found. Expected a header like "Chip Time", "Net Time", "Finish Time", or "Time".',
      },
      { status: 400 },
    );
  }

  const entries = await loadMatchableEntries(service, eventId, distanceId);
  const matches = matchRowsToEntries(rows, entries);

  // Fresh import replaces the previous one for this distance.
  const { error: delErr } = await service
    .from("results_raw")
    .delete()
    .eq("event_id", eventId)
    .eq("distance_id", distanceId);
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  const importBatch = randomUUID();
  const sourceFilename = (file as File).name || "upload.csv";

  const dbRows = rows.map((row, i) => {
    const match = matches.get(row.rowNum) ?? null;
    const isMatch = match !== null && "entryId" in match;
    const note = row.problem
      ? row.problem
      : match && "duplicateOf" in match
        ? `Duplicate of file row ${match.duplicateOf} (same runner)`
        : null;
    return {
      event_id: eventId,
      distance_id: distanceId,
      import_batch: importBatch,
      source_filename: sourceFilename,
      matched_entry_id: isMatch ? match.entryId : null,
      match_status: isMatch ? "matched" : "unmatched",
      row_json: {
        raw: rawRows[i],
        parsed: {
          row_num: row.rowNum,
          bib: row.bib,
          pr_id: row.prId,
          first_name: row.firstName,
          last_name: row.lastName,
          time_ms: row.timeMs,
          time_display: row.timeDisplay,
          match_method: isMatch ? match.method : null,
          note,
        },
      },
    };
  });

  for (let i = 0; i < dbRows.length; i += WRITE_CHUNK) {
    const { error: insErr } = await service.from("results_raw").insert(dbRows.slice(i, i + WRITE_CHUNK));
    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    importBatch,
    detectedColumns: columns,
    summary: summarize(dbRows),
  });
}

/** PATCH { raw_id, action: "match" | "ignore" | "unmatch", entry_id? } */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  let body: { raw_id?: string; action?: string; entry_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const rawId = String(body.raw_id ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!rawId || !["match", "ignore", "unmatch"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Provide raw_id and a valid action." }, { status: 400 });
  }

  const { data: rawRow } = await service
    .from("results_raw")
    .select("id,event_id,distance_id")
    .eq("id", rawId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!rawRow) {
    return NextResponse.json({ ok: false, error: "Import row not found." }, { status: 404 });
  }

  if (action === "match") {
    const entryId = String(body.entry_id ?? "").trim();
    if (!entryId) {
      return NextResponse.json({ ok: false, error: "Provide entry_id to match." }, { status: 400 });
    }
    const { data: entry } = await service
      .from("entries")
      .select("id")
      .eq("id", entryId)
      .eq("event_id", eventId)
      .eq("distance_id", (rawRow as { distance_id: string }).distance_id)
      .maybeSingle();
    if (!entry) {
      return NextResponse.json({ ok: false, error: "Entry not found for this distance." }, { status: 404 });
    }
    const { data: taken } = await service
      .from("results_raw")
      .select("id")
      .eq("event_id", eventId)
      .eq("distance_id", (rawRow as { distance_id: string }).distance_id)
      .eq("matched_entry_id", entryId)
      .neq("id", rawId)
      .maybeSingle();
    if (taken) {
      return NextResponse.json(
        { ok: false, error: "That runner is already matched to another row. Unmatch it first." },
        { status: 409 },
      );
    }
    const { error } = await service
      .from("results_raw")
      .update({ matched_entry_id: entryId, match_status: "matched" })
      .eq("id", rawId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    const { error } = await service
      .from("results_raw")
      .update({
        matched_entry_id: null,
        match_status: action === "ignore" ? "ignored" : "unmatched",
      })
      .eq("id", rawId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import Papa from "papaparse";

import {
  DEMO_IMPORT_MAX_ROWS,
  prepareDemoRowsFromCsv,
  runDemoImport,
} from "@/lib/demo/demo-import";
import { isSuperAdmin, loadEventIsDemo } from "@/lib/demo/event";
import type { CsvRowInput } from "@/lib/bulk-import/engine";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isSuperAdmin(supabase, auth.user.id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (!(await loadEventIsDemo(supabase, eventId))) {
    return NextResponse.json({ ok: false, error: "Not a demo event." }, { status: 400 });
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data." }, { status: 400 });
  }

  const defaultDistanceRaw = form.get("default_distance_id");
  const defaultDistanceId =
    defaultDistanceRaw != null && String(defaultDistanceRaw).trim() !== ""
      ? String(defaultDistanceRaw).trim()
      : null;
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "Attach a CSV file." }, { status: 400 });
  }

  const { data: eventRow } = await service
    .from("events")
    .select("id,pr_cutoff")
    .eq("id", eventId)
    .single();
  if (!eventRow) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  const { data: distances } = await service
    .from("distances")
    .select("id,pr_cutoff")
    .eq("event_id", eventId);
  const distanceIdsAllowed = new Set((distances ?? []).map((d) => (d as { id: string }).id));
  if (distanceIdsAllowed.size === 0) {
    return NextResponse.json({ ok: false, error: "Add at least one distance before importing participants." }, { status: 400 });
  }

  const text = await (file as File).text();
  const parsed = Papa.parse<CsvRowInput>(text, {
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
  if (rawRows.length > DEMO_IMPORT_MAX_ROWS) {
    return NextResponse.json({ ok: false, error: `Too many rows (max ${DEMO_IMPORT_MAX_ROWS}).` }, { status: 400 });
  }

  const { rows: prepared, rowErrors: prepErrors } = prepareDemoRowsFromCsv(
    rawRows,
    eventId,
    distanceIdsAllowed,
    defaultDistanceId,
  );
  if (prepared.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No valid rows to import.",
      rowErrors: prepErrors,
    }, { status: 400 });
  }

  const distanceCutoffs = new Map(
    (distances ?? []).map((d) => [(d as { id: string }).id, (d as { pr_cutoff?: string | null }).pr_cutoff ?? null]),
  );
  const eventCutoff = (eventRow as { pr_cutoff?: string | null }).pr_cutoff ?? null;

  const result = await runDemoImport(service, eventId, prepared, distanceCutoffs, eventCutoff);
  return NextResponse.json({
    ...result,
    rowErrors: [...prepErrors, ...result.rowErrors],
  });
}

import { NextResponse } from "next/server";
import Papa from "papaparse";

import {
  BULK_IMPORT_MAX_ROWS,
  prepareRowsFromCsv,
  runBulkImport,
  type CsvRowInput,
} from "@/lib/bulk-import/engine";
import { canUserBulkImportForEvent } from "@/lib/bulk-import/scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "You must be signed in." }, { status: 401 });
  }

  const service = createServiceRoleSupabaseClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!service || !serviceKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Bulk import is not configured on this server (missing SUPABASE_SERVICE_ROLE_KEY). Add it to your environment for the Next.js server only.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data." }, { status: 400 });
  }

  const eventId = String(form.get("event_id") ?? "").trim();
  const defaultDistanceRaw = form.get("default_distance_id");
  const defaultDistanceId =
    defaultDistanceRaw != null && String(defaultDistanceRaw).trim() !== ""
      ? String(defaultDistanceRaw).trim()
      : null;

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "Attach a CSV file." }, { status: 400 });
  }

  if (!eventId) {
    return NextResponse.json({ ok: false, error: "Select an event." }, { status: 400 });
  }

  const allowed = await canUserBulkImportForEvent(supabase, user.id, eventId);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to import for this event." },
      { status: 403 },
    );
  }

  const { data: eventRow, error: evErr } = await supabase
    .from("events")
    .select("id,pr_cutoff")
    .eq("id", eventId)
    .single();

  if (evErr || !eventRow) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  const { data: distRows, error: dErr } = await supabase
    .from("distances")
    .select("id,pr_cutoff")
    .eq("event_id", eventId);

  if (dErr || !distRows?.length) {
    return NextResponse.json(
      { ok: false, error: "No distances for this event. Add distances in the event editor first." },
      { status: 400 },
    );
  }

  const distanceIdsAllowed = new Set(distRows.map((d) => d.id as string));
  const distanceCutoffs = new Map<string, string | null>(
    distRows.map((d) => [d.id as string, (d.pr_cutoff as string | null) ?? null]),
  );

  let text: string;
  try {
    text = await (file as File).text();
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the file." }, { status: 400 });
  }

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const parsed = Papa.parse<CsvRowInput>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => String(h).trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    return NextResponse.json(
      {
        ok: false,
        error: `CSV parse error: ${first.message} (row ${first.row})`,
      },
      { status: 400 },
    );
  }

  const rawRows = parsed.data.filter((r) => Object.keys(r).some((k) => String((r as CsvRowInput)[k]).trim() !== ""));

  if (rawRows.length === 0) {
    return NextResponse.json({ ok: false, error: "No data rows in CSV." }, { status: 400 });
  }

  if (rawRows.length > BULK_IMPORT_MAX_ROWS) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many rows (${rawRows.length}). Maximum is ${BULK_IMPORT_MAX_ROWS}.`,
      },
      { status: 400 },
    );
  }

  const { rows: prepared, rowErrors: validationErrors } = prepareRowsFromCsv(
    rawRows,
    eventId,
    distanceIdsAllowed,
    defaultDistanceId,
  );

  if (prepared.length === 0) {
    return NextResponse.json({
      ok: false,
      hadValidationRejections: validationErrors.length > 0,
      summary: {
        rowsTotal: rawRows.length,
        rowsValid: 0,
        rowsRejected: validationErrors.length,
        usersCreated: 0,
        profilesUpserted: 0,
        membershipsUpserted: 0,
        entriesInserted: 0,
        entriesSkippedAlreadyRegistered: 0,
        entriesSkippedDuplicateInFile: 0,
        uniqueRegistrationKeysInFile: 0,
      },
      rowErrors: validationErrors,
    });
  }

  const result = await runBulkImport(
    service,
    eventId,
    (eventRow as { pr_cutoff: string | null }).pr_cutoff,
    distanceCutoffs,
    prepared,
  );

  const rowErrors = [...validationErrors, ...result.rowErrors];

  return NextResponse.json({
    ok: result.ok,
    hadValidationRejections: validationErrors.length > 0,
    summary: {
      ...result.summary,
      rowsTotal: rawRows.length,
      rowsValid: prepared.length,
      rowsRejected: validationErrors.length,
    },
    rowErrors,
  });
}

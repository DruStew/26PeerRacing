/**
 * Demo participant import — entries only, no auth users, memberships, or wallets.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { digitsPhone, formatDob, mapActiveOrRetiredMilitary, mapSex, normEmail } from "@/lib/bulk-import/helpers";
import type { CsvRowInput } from "@/lib/bulk-import/engine";

export const DEMO_IMPORT_MAX_ROWS = 5000;
const DB_WRITE_CHUNK = 200;

export type DemoPreparedRow = {
  rowIndex: number;
  emailNorm: string;
  first_name: string;
  last_name: string;
  phoneDigits: string;
  dob: string;
  sex: "male" | "female";
  active_or_retired_military: boolean;
  distance_id: string;
  bib: string | null;
  transponder_1: string | null;
  transponder_2: string | null;
};

export type DemoImportResult = {
  ok: boolean;
  summary: {
    rowsTotal: number;
    rowsValid: number;
    rowsRejected: number;
    entriesInserted: number;
    entriesSkippedAlreadyRegistered: number;
    entriesSkippedDuplicateInFile: number;
  };
  rowErrors: Array<{ row: number; message: string }>;
};

function cutoffForRow(
  distanceId: string,
  distanceCutoffs: Map<string, string | null>,
  eventCutoff: string | null,
): string {
  const d = distanceCutoffs.get(distanceId);
  const c = d ?? eventCutoff;
  if (c) return new Date(c).toISOString();
  return new Date().toISOString();
}

export function prepareDemoRowsFromCsv(
  rawRows: CsvRowInput[],
  eventId: string,
  distanceIdsAllowed: Set<string>,
  defaultDistanceId: string | null,
): { rows: DemoPreparedRow[]; rowErrors: Array<{ row: number; message: string }> } {
  const rowErrors: Array<{ row: number; message: string }> = [];
  const rows: DemoPreparedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i]!;
    const rowNum = i + 2;
    const first_name = String(r.first_name ?? r.FirstName ?? r["first name"] ?? r.first ?? "").trim();
    const last_name = String(r.last_name ?? r.LastName ?? r["last name"] ?? r.last ?? "").trim();
    const distRaw = r.distance_id ?? r.distanceId ?? r.DistanceId ?? "";
    const distance_id = String(distRaw).trim() || (defaultDistanceId ?? "");
    const bibRaw = r.bib ?? r.Bib ?? r.assigned_bib ?? r["race number"] ?? "";
    const bib = String(bibRaw).trim() || null;
    const emailRaw = r.email ?? r.Email ?? "";
    const emailNorm =
      normEmail(emailRaw) ||
      `demo+${eventId.slice(0, 8)}+${rowNum}@demo.peerracing.invalid`;
    const phoneRaw = r.phone ?? r.Phone ?? "";
    const phoneDigits = digitsPhone(phoneRaw).length >= 10 ? digitsPhone(phoneRaw) : `555555${String(rowNum).padStart(4, "0").slice(-4)}`;
    const dobRaw = r.dob ?? r.DOB ?? r.birthdate ?? r.age;
    const dob = formatDob(dobRaw) || "1990-01-01";
    const sexRaw = mapSex(r.sex ?? r.Sex ?? r.gender);
    const sex: "male" | "female" = sexRaw ?? "male";
    const tp1Raw = r.transponder_1 ?? r.Transponder1 ?? r.transponder1 ?? "";
    const tp2Raw = r.transponder_2 ?? r.Transponder2 ?? r.transponder2 ?? "";
    const transponder_1 = tp1Raw === "" || tp1Raw == null ? null : String(tp1Raw).trim();
    const transponder_2 = tp2Raw === "" || tp2Raw == null ? null : String(tp2Raw).trim();
    const militaryCol =
      r.military ?? r.Military ?? r.active_or_retired_military ?? r.activeOrRetiredMilitary;

    if (!first_name || !last_name) {
      rowErrors.push({ row: rowNum, message: "Missing first or last name" });
      continue;
    }
    if (!distance_id || !distanceIdsAllowed.has(distance_id)) {
      rowErrors.push({ row: rowNum, message: "Missing or invalid distance_id" });
      continue;
    }

    rows.push({
      rowIndex: rowNum,
      emailNorm,
      first_name,
      last_name,
      phoneDigits,
      dob,
      sex,
      active_or_retired_military: mapActiveOrRetiredMilitary(militaryCol),
      distance_id,
      bib,
      transponder_1,
      transponder_2,
    });
  }

  return { rows, rowErrors };
}

export async function runDemoImport(
  service: SupabaseClient,
  eventId: string,
  prepared: DemoPreparedRow[],
  distanceCutoffs: Map<string, string | null>,
  eventCutoff: string | null,
): Promise<DemoImportResult> {
  const rowErrors: Array<{ row: number; message: string }> = [];
  let entriesInserted = 0;
  let entriesSkippedAlreadyRegistered = 0;
  let entriesSkippedDuplicateInFile = 0;

  const { data: existingRows } = await service
    .from("entries")
    .select("email,distance_id")
    .eq("event_id", eventId);

  const existingInDb = new Set<string>();
  for (const e of existingRows ?? []) {
    const row = e as { email: string; distance_id: string | null };
    if (row.distance_id) {
      existingInDb.add(`${row.email.trim().toLowerCase()}|${row.distance_id}`);
    }
  }

  const entryRows: Array<Record<string, unknown>> = [];
  const seenInFile = new Set<string>();
  // Re-importing the same roster updates the military flag on existing entries
  // (e.g. the first upload was missing the military column). Grouped per
  // distance + flag so it's a handful of UPDATEs, not one per row.
  const militaryUpdates = new Map<string, { distanceId: string; flag: boolean; emails: string[] }>();

  for (const pr of prepared) {
    const key = `${pr.emailNorm}|${pr.distance_id}`;
    if (existingInDb.has(key)) {
      entriesSkippedAlreadyRegistered += 1;
      const gKey = `${pr.distance_id}|${pr.active_or_retired_military}`;
      const group =
        militaryUpdates.get(gKey) ??
        { distanceId: pr.distance_id, flag: pr.active_or_retired_military, emails: [] };
      group.emails.push(pr.emailNorm);
      militaryUpdates.set(gKey, group);
      continue;
    }
    if (seenInFile.has(key)) {
      entriesSkippedDuplicateInFile += 1;
      continue;
    }
    seenInFile.add(key);

    entryRows.push({
      event_id: eventId,
      user_id: null,
      distance_id: pr.distance_id,
      first_name: pr.first_name,
      last_name: pr.last_name,
      phone: pr.phoneDigits,
      email: pr.emailNorm,
      dob: pr.dob,
      sex: pr.sex,
      active_or_retired_military: pr.active_or_retired_military,
      bib: pr.bib,
      transponder_1: pr.transponder_1,
      transponder_2: pr.transponder_2,
      entry_kind: "comp",
      entry_type: "primary",
      source_entry_id: null,
      cutoff_snapshot: cutoffForRow(pr.distance_id, distanceCutoffs, eventCutoff),
      eligible: true,
    });
  }

  for (let i = 0; i < entryRows.length; i += DB_WRITE_CHUNK) {
    const chunk = entryRows.slice(i, i + DB_WRITE_CHUNK);
    const { error } = await service.from("entries").insert(chunk);
    if (error) {
      rowErrors.push({ row: 0, message: `Insert batch: ${error.message}` });
      return {
        ok: false,
        summary: {
          rowsTotal: prepared.length,
          rowsValid: prepared.length,
          rowsRejected: 0,
          entriesInserted,
          entriesSkippedAlreadyRegistered,
          entriesSkippedDuplicateInFile,
        },
        rowErrors,
      };
    }
    entriesInserted += chunk.length;
  }

  for (const group of militaryUpdates.values()) {
    for (let i = 0; i < group.emails.length; i += DB_WRITE_CHUNK) {
      const emails = group.emails.slice(i, i + DB_WRITE_CHUNK);
      const { error } = await service
        .from("entries")
        .update({ active_or_retired_military: group.flag })
        .eq("event_id", eventId)
        .eq("distance_id", group.distanceId)
        .in("email", emails);
      if (error) {
        rowErrors.push({ row: 0, message: `Military flag update: ${error.message}` });
      }
    }
  }

  return {
    ok: rowErrors.length === 0,
    summary: {
      rowsTotal: prepared.length,
      rowsValid: prepared.length,
      rowsRejected: 0,
      entriesInserted,
      entriesSkippedAlreadyRegistered,
      entriesSkippedDuplicateInFile,
    },
    rowErrors,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { batchResolveAuthUserIdsByEmail } from "./auth-lookup";
import { digitsPhone, formatDob, mapSex, normEmail } from "./helpers";

export const BULK_IMPORT_MAX_ROWS = 5000;
const PROFILE_CHUNK = 250;
const DB_WRITE_CHUNK = 200;
const AUTH_PARALLEL = 10;

export type CsvRowInput = Record<string, string | number | undefined | null>;

export type PreparedRow = {
  rowIndex: number;
  emailNorm: string;
  first_name: string;
  last_name: string;
  phoneDigits: string;
  dob: string;
  sex: "male" | "female";
  distance_id: string;
  bib: string | null;
};

export type BulkImportResult = {
  ok: boolean;
  summary: {
    rowsTotal: number;
    rowsValid: number;
    rowsRejected: number;
    usersCreated: number;
    profilesUpserted: number;
    membershipsUpserted: number;
    entriesInserted: number;
    /** Row already had an entry for this event + distance in the database (or insert hit unique constraint). */
    entriesSkippedAlreadyRegistered: number;
    /** Same runner + distance appears more than once in this CSV (only the first occurrence can insert). */
    entriesSkippedDuplicateInFile: number;
    /** Distinct (user, distance) pairs in the file after resolving emails (for spotting repeated lines). */
    uniqueRegistrationKeysInFile: number;
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

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx]!, idx);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Prepare and validate CSV rows for a single event. `defaultDistanceId` used when column missing.
 */
export function prepareRowsFromCsv(
  rawRows: CsvRowInput[],
  eventId: string,
  distanceIdsAllowed: Set<string>,
  defaultDistanceId: string | null,
): { rows: PreparedRow[]; rowErrors: Array<{ row: number; message: string }> } {
  const rowErrors: Array<{ row: number; message: string }> = [];
  const rows: PreparedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i]!;
    const rowNum = i + 2;
    const emailNorm = normEmail(r.email ?? r.Email);
    const first_name = String(r.first_name ?? r.FirstName ?? r["first name"] ?? "").trim();
    const last_name = String(r.last_name ?? r.LastName ?? r["last name"] ?? "").trim();
    const phoneRaw = r.phone ?? r.Phone ?? "";
    const phoneDigits = digitsPhone(phoneRaw);
    const dob = formatDob(r.dob ?? r.DOB ?? r.birthdate);
    const sex = mapSex(r.sex ?? r.Sex ?? r.gender);
    const distRaw = r.distance_id ?? r.distanceId ?? r.DistanceId ?? "";
    const distance_id = String(distRaw).trim() || (defaultDistanceId ?? "");
    const bibRaw = r.bib ?? r.Bib ?? "";

    if (!emailNorm || !emailNorm.includes("@")) {
      rowErrors.push({ row: rowNum, message: "Invalid or missing email" });
      continue;
    }
    if (!first_name || !last_name) {
      rowErrors.push({ row: rowNum, message: "Missing first or last name" });
      continue;
    }
    if (phoneDigits.length < 10) {
      rowErrors.push({ row: rowNum, message: "Phone needs at least 10 digits" });
      continue;
    }
    if (!dob) {
      rowErrors.push({ row: rowNum, message: "Invalid or missing date of birth" });
      continue;
    }
    if (!sex) {
      rowErrors.push({ row: rowNum, message: "Sex must be M/F or male/female" });
      continue;
    }
    if (!distance_id) {
      rowErrors.push({
        row: rowNum,
        message: "Missing distance_id (column or default distance)",
      });
      continue;
    }
    if (!distanceIdsAllowed.has(distance_id)) {
      rowErrors.push({
        row: rowNum,
        message: "distance_id does not belong to the selected event",
      });
      continue;
    }

    const csvEvent = String(r.event_id ?? r.eventId ?? "").trim();
    if (csvEvent && csvEvent !== eventId) {
      rowErrors.push({ row: rowNum, message: "event_id in file does not match selected event" });
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
      distance_id,
      bib: bibRaw === "" || bibRaw == null ? null : String(bibRaw).trim(),
    });
  }

  return { rows, rowErrors };
}

export async function runBulkImport(
  service: SupabaseClient,
  eventId: string,
  eventPrCutoff: string | null,
  distanceCutoffs: Map<string, string | null>,
  prepared: PreparedRow[],
): Promise<BulkImportResult> {
  const rowErrors: Array<{ row: number; message: string }> = [];
  let usersCreated = 0;
  let entriesInserted = 0;
  let entriesSkippedAlreadyRegistered = 0;
  let entriesSkippedDuplicateInFile = 0;

  const uniqueEmails = [...new Set(prepared.map((p) => p.emailNorm))];
  const emailToUserId = new Map<string, string>();

  for (let i = 0; i < uniqueEmails.length; i += PROFILE_CHUNK) {
    const chunk = uniqueEmails.slice(i, i + PROFILE_CHUNK);
    const { data: profs, error } = await service.from("profiles").select("id,email").in("email", chunk);
    if (error) {
      return {
        ok: false,
        summary: {
          rowsTotal: prepared.length,
          rowsValid: prepared.length,
          rowsRejected: 0,
          usersCreated: 0,
          profilesUpserted: 0,
          membershipsUpserted: 0,
          entriesInserted: 0,
          entriesSkippedAlreadyRegistered: 0,
          entriesSkippedDuplicateInFile: 0,
          uniqueRegistrationKeysInFile: 0,
        },
        rowErrors: [{ row: 0, message: `Profile lookup failed: ${error.message}` }],
      };
    }
    for (const p of profs ?? []) {
      const em = normEmail((p as { email?: string }).email);
      if (em) emailToUserId.set(em, (p as { id: string }).id);
    }
  }

  const missingAfterProfile = uniqueEmails.filter((e) => !emailToUserId.has(e));
  if (missingAfterProfile.length > 0) {
    const authLookup = await batchResolveAuthUserIdsByEmail(service, missingAfterProfile);
    if (!authLookup.ok) {
      return {
        ok: false,
        summary: {
          rowsTotal: prepared.length,
          rowsValid: prepared.length,
          rowsRejected: 0,
          usersCreated: 0,
          profilesUpserted: 0,
          membershipsUpserted: 0,
          entriesInserted: 0,
          entriesSkippedAlreadyRegistered: 0,
          entriesSkippedDuplicateInFile: 0,
          uniqueRegistrationKeysInFile: 0,
        },
        rowErrors: [{ row: 0, message: authLookup.message }],
      };
    }
    for (const [em, id] of authLookup.map) {
      emailToUserId.set(em, id);
    }
  }

  const stillMissing = uniqueEmails.filter((e) => !emailToUserId.has(e));
  type CreateRow =
    | { kind: "ok"; email: string; id: string }
    | { kind: "duplicate"; email: string }
    | { kind: "error"; email: string; err: string };

  /** Auth users created in this run only — we upsert `profiles` for these ids, never for pre-existing accounts. */
  const userIdsCreatedInThisRun = new Set<string>();

  const createRows: CreateRow[] = await mapPool(stillMissing, AUTH_PARALLEL, async (email) => {
    const { data, error } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (!error) {
      const id = data.user?.id ?? null;
      if (id) return { kind: "ok" as const, email, id };
      return { kind: "error" as const, email, err: "Auth create returned no user id" };
    }
    const msg = error.message?.toLowerCase() ?? "";
    if (
      msg.includes("already") ||
      msg.includes("duplicate") ||
      (error as { status?: number }).status === 422
    ) {
      return { kind: "duplicate" as const, email };
    }
    return { kind: "error" as const, email, err: error.message };
  });

  const duplicateEmails = createRows.filter((r): r is Extract<CreateRow, { kind: "duplicate" }> => r.kind === "duplicate").map(
    (r) => r.email,
  );
  let duplicateIdMap = new Map<string, string>();
  if (duplicateEmails.length > 0) {
    const dupLookup = await batchResolveAuthUserIdsByEmail(service, duplicateEmails);
    if (!dupLookup.ok) {
      return {
        ok: false,
        summary: {
          rowsTotal: prepared.length,
          rowsValid: prepared.length,
          rowsRejected: 0,
          usersCreated: 0,
          profilesUpserted: 0,
          membershipsUpserted: 0,
          entriesInserted: 0,
          entriesSkippedAlreadyRegistered: 0,
          entriesSkippedDuplicateInFile: 0,
          uniqueRegistrationKeysInFile: 0,
        },
        rowErrors: [{ row: 0, message: dupLookup.message }],
      };
    }
    duplicateIdMap = dupLookup.map;
  }

  for (const r of createRows) {
    if (r.kind === "error") {
      rowErrors.push({ row: 0, message: `Auth create ${r.email}: ${r.err}` });
      continue;
    }
    if (r.kind === "ok") {
      emailToUserId.set(r.email, r.id);
      userIdsCreatedInThisRun.add(r.id);
      usersCreated += 1;
      continue;
    }
    const id = duplicateIdMap.get(normEmail(r.email));
    if (id) emailToUserId.set(r.email, id);
  }

  const membershipEnd = new Date();
  membershipEnd.setFullYear(membershipEnd.getFullYear() + 1);

  /** One profile row per user id (Postgres upsert forbids the same PK twice in one statement). */
  const userIdToSample = new Map<string, PreparedRow>();
  for (const pr of prepared) {
    const uid = emailToUserId.get(pr.emailNorm);
    if (!uid) continue;
    if (!userIdToSample.has(uid)) userIdToSample.set(uid, pr);
  }

  const profilePayloads = [...userIdToSample.entries()]
    .filter(([id]) => userIdsCreatedInThisRun.has(id))
    .map(([id, sample]) => ({
      id,
      first_name: sample.first_name,
      last_name: sample.last_name,
      email: sample.emailNorm,
      phone: sample.phoneDigits,
      dob: sample.dob,
      sex: sample.sex,
    }));

  let profilesUpserted = 0;
  for (let i = 0; i < profilePayloads.length; i += DB_WRITE_CHUNK) {
    const chunk = profilePayloads.slice(i, i + DB_WRITE_CHUNK);
    const { error } = await service.from("profiles").upsert(chunk, { onConflict: "id" });
    if (error) {
      rowErrors.push({ row: 0, message: `Profiles batch: ${error.message}` });
      return {
        ok: false,
        summary: {
          rowsTotal: prepared.length,
          rowsValid: prepared.length,
          rowsRejected: 0,
          usersCreated,
          profilesUpserted,
          membershipsUpserted: 0,
          entriesInserted: 0,
          entriesSkippedAlreadyRegistered: 0,
          entriesSkippedDuplicateInFile: 0,
          uniqueRegistrationKeysInFile: 0,
        },
        rowErrors,
      };
    }
    profilesUpserted += chunk.length;
  }

  const uniqueUserIds = [...new Set(userIdToSample.keys())];
  const memPayloads = uniqueUserIds.map((user_id) => ({
    user_id,
    status: "active" as const,
    membership_start_at: new Date().toISOString(),
    membership_end_at: membershipEnd.toISOString(),
    renewal_count: 0,
    updated_at: new Date().toISOString(),
  }));

  let membershipsUpserted = 0;
  for (let i = 0; i < memPayloads.length; i += DB_WRITE_CHUNK) {
    const chunk = memPayloads.slice(i, i + DB_WRITE_CHUNK);
    const { error } = await service.from("memberships").upsert(chunk, { onConflict: "user_id" });
    if (error) {
      rowErrors.push({ row: 0, message: `Memberships batch: ${error.message}` });
      return {
        ok: false,
        summary: {
          rowsTotal: prepared.length,
          rowsValid: prepared.length,
          rowsRejected: 0,
          usersCreated,
          profilesUpserted,
          membershipsUpserted,
          entriesInserted: 0,
          entriesSkippedAlreadyRegistered: 0,
          entriesSkippedDuplicateInFile: 0,
          uniqueRegistrationKeysInFile: 0,
        },
        rowErrors,
      };
    }
    membershipsUpserted += chunk.length;
  }

  const userIds = [...new Set(prepared.map((p) => emailToUserId.get(p.emailNorm)).filter(Boolean))] as string[];

  /** Pairs that already exist in `entries` for this event (from DB). */
  const existingInDb = new Set<string>();
  if (userIds.length > 0) {
    for (let i = 0; i < userIds.length; i += PROFILE_CHUNK) {
      const chunk = userIds.slice(i, i + PROFILE_CHUNK);
      const { data: existing } = await service
        .from("entries")
        .select("user_id,distance_id")
        .eq("event_id", eventId)
        .in("user_id", chunk);
      for (const e of existing ?? []) {
        const row = e as { user_id: string; distance_id: string | null };
        if (row.distance_id) existingInDb.add(`${row.user_id}|${row.distance_id}`);
      }
    }
  }

  const entryRows: Array<{
    event_id: string;
    user_id: string;
    distance_id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    dob: string;
    sex: string;
    bib: string | null;
    entry_kind: string;
    entry_type: string;
    source_entry_id: null;
    cutoff_snapshot: string;
    eligible: boolean;
  }> = [];

  const seenInFile = new Set<string>();
  for (const pr of prepared) {
    const userId = emailToUserId.get(pr.emailNorm);
    if (!userId) {
      rowErrors.push({ row: pr.rowIndex, message: "Could not resolve user for email" });
      continue;
    }
    const key = `${userId}|${pr.distance_id}`;
    if (existingInDb.has(key)) {
      entriesSkippedAlreadyRegistered += 1;
      continue;
    }
    if (seenInFile.has(key)) {
      entriesSkippedDuplicateInFile += 1;
      continue;
    }
    seenInFile.add(key);
    entryRows.push({
      event_id: eventId,
      user_id: userId,
      distance_id: pr.distance_id,
      first_name: pr.first_name,
      last_name: pr.last_name,
      phone: pr.phoneDigits,
      email: pr.emailNorm,
      dob: pr.dob,
      sex: pr.sex,
      bib: pr.bib,
      entry_kind: "free",
      entry_type: "primary",
      source_entry_id: null,
      cutoff_snapshot: cutoffForRow(pr.distance_id, distanceCutoffs, eventPrCutoff),
      eligible: true,
    });
  }

  for (let i = 0; i < entryRows.length; i += DB_WRITE_CHUNK) {
    const chunk = entryRows.slice(i, i + DB_WRITE_CHUNK);
    const { error } = await service.from("entries").insert(chunk);
    if (!error) {
      entriesInserted += chunk.length;
      continue;
    }
    for (const row of chunk) {
      const { error: oneErr } = await service.from("entries").insert(row);
      if (!oneErr) {
        entriesInserted += 1;
        continue;
      }
      if (oneErr.code === "23505" || String(oneErr.message).toLowerCase().includes("duplicate")) {
        entriesSkippedAlreadyRegistered += 1;
      } else {
        rowErrors.push({ row: 0, message: `Entry insert: ${oneErr.message}` });
      }
    }
  }

  const uniqueRegistrationKeysInFile = (() => {
    const s = new Set<string>();
    for (const pr of prepared) {
      const uid = emailToUserId.get(pr.emailNorm);
      if (!uid) continue;
      s.add(`${uid}|${pr.distance_id}`);
    }
    return s.size;
  })();

  const systemErrors = rowErrors.filter((e) => e.row === 0);
  return {
    ok: systemErrors.length === 0,
    summary: {
      rowsTotal: prepared.length,
      rowsValid: prepared.length,
      rowsRejected: 0,
      usersCreated,
      profilesUpserted,
      membershipsUpserted,
      entriesInserted,
      entriesSkippedAlreadyRegistered,
      entriesSkippedDuplicateInFile,
      uniqueRegistrationKeysInFile,
    },
    rowErrors,
  };
}

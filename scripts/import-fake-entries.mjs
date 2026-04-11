/**
 * Import fake runners from the Peer Racing Excel workbook into Supabase:
 * - Creates auth users (or reuses existing by email)
 * - Upserts profiles + memberships
 * - Inserts entries (skips duplicates)
 *
 * Prerequisites:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (Dashboard → Settings → API — never commit this key)
 * - IMPORT_XLSX_PATH = path to peer_racing_fake_entries_600_from_400_individuals.xlsx
 *
 * Usage:
 *   set IMPORT_XLSX_PATH=C:\Users\...\peer_racing_fake_entries_600_from_400_individuals.xlsx
 *   set SUPABASE_URL=https://xxxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   node scripts/import-fake-entries.mjs
 *
 * Dry run (no writes):
 *   set DRY_RUN=1
 *   node scripts/import-fake-entries.mjs
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const XLSX_PATH =
  process.env.IMPORT_XLSX_PATH ||
  path.join(process.env.USERPROFILE || "", "Downloads", "peer_racing_fake_entries_600_from_400_individuals.xlsx");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function digitsPhone(p) {
  return String(p ?? "").replace(/\D/g, "");
}

/** @param {unknown} v */
function formatDob(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/** @param {string} m */
function mapSex(m) {
  const u = String(m ?? "").trim().toUpperCase();
  if (u === "M" || u === "MALE") return "male";
  if (u === "F" || u === "FEMALE") return "female";
  return null;
}

async function loadExistingUsers(supabase) {
  const map = new Map();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data.users ?? [];
    for (const u of users) {
      if (u.email) map.set(u.email.toLowerCase(), u.id);
    }
    if (users.length < perPage) break;
    page += 1;
  }
  return map;
}

async function main() {
  if (!SUPABASE_URL) die("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!SERVICE_KEY) die("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!fs.existsSync(XLSX_PATH)) die(`File not found: ${XLSX_PATH}\nSet IMPORT_XLSX_PATH to your .xlsx file.`);

  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true, type: "file" });
  const sheet = wb.Sheets["Entries"];
  if (!sheet) die('Workbook must contain a sheet named "Entries".');

  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (!raw.length) die("No data rows in Entries sheet.");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  /** @type {Array<Record<string, unknown>>} */
  const rows = raw.map((r) => {
    const o = /** @type {Record<string, unknown>} */ (r);
    return {
      first_name: o.first_name,
      last_name: o.last_name,
      email: o.email,
      phone: o.phone,
      dob: o.dob,
      sex: o.sex,
      event_id: o.event_id,
      event_name: o.event_name,
      distance_id: o.distance_id,
      label: o.label,
      bib: o.bib,
    };
  });

  const eventIds = [...new Set(rows.map((r) => String(r.event_id)).filter(Boolean))];
  const distanceIds = [...new Set(rows.map((r) => String(r.distance_id)).filter(Boolean))];

  const { data: distRows, error: distErr } = await supabase
    .from("distances")
    .select("id,event_id,pr_cutoff,label")
    .in("id", distanceIds);

  if (distErr) die(`distances query: ${distErr.message}`);
  const distById = new Map((distRows ?? []).map((d) => [d.id, d]));

  const { data: evRows, error: evErr } = await supabase
    .from("events")
    .select("id,pr_cutoff,name")
    .in("id", eventIds);

  if (evErr) die(`events query: ${evErr.message}`);
  const evById = new Map((evRows ?? []).map((e) => [e.id, e]));

  for (const did of distanceIds) {
    const d = distById.get(did);
    if (!d) die(`Distance id not in database: ${did}`);
  }
  for (const eid of eventIds) {
    if (!evById.has(eid)) die(`Event id not in database: ${eid}`);
  }

  function cutoffFor(eventId, distanceId) {
    const d = distById.get(distanceId);
    const e = evById.get(eventId);
    const c = d?.pr_cutoff ?? e?.pr_cutoff;
    if (c) return new Date(c).toISOString();
    return new Date().toISOString();
  }

  /** @param {typeof rows[0]} row */
  function validateRow(row) {
    const eid = String(row.event_id);
    const did = String(row.distance_id);
    const d = distById.get(did);
    if (!d) return `Unknown distance_id ${did}`;
    if (d.event_id !== eid)
      return `distance ${did} belongs to event ${d.event_id}, row has event ${eid}`;
    return null;
  }

  for (const row of rows) {
    const err = validateRow(row);
    if (err) die(`Invalid row (${row.email}): ${err}`);
  }

  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Rows: ${rows.length} | Events in file: ${eventIds.length} | Distances: ${distanceIds.length}`);

  if (DRY_RUN) {
    console.log("DRY_RUN — no database writes. Validation passed.");
    process.exit(0);
  }

  let emailToUserId = await loadExistingUsers(supabase);
  console.log(`Existing auth users loaded: ${emailToUserId.size}`);

  const byEmail = new Map();
  for (const row of rows) {
    const em = String(row.email ?? "").trim().toLowerCase();
    if (!em) die("Row missing email");
    if (!byEmail.has(em)) byEmail.set(em, row);
  }

  const authDelayMs = Number(process.env.AUTH_CREATE_DELAY_MS ?? "80");

  let createdUsers = 0;
  for (const [emailKey, sample] of byEmail) {
    if (emailToUserId.has(emailKey)) continue;

    const { data, error } = await supabase.auth.admin.createUser({
      email: String(sample.email).trim(),
      email_confirm: true,
    });

    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      const dup =
        msg.includes("already been registered") ||
        msg.includes("already registered") ||
        msg.includes("duplicate") ||
        error.status === 422;
      if (dup) {
        emailToUserId = await loadExistingUsers(supabase);
        if (!emailToUserId.has(emailKey)) die(`User exists but could not resolve: ${emailKey}`);
        continue;
      }
      die(`createUser ${emailKey}: ${error.message}`);
    }
    if (!data.user?.id) die(`createUser returned no user: ${emailKey}`);
    emailToUserId.set(emailKey, data.user.id);
    createdUsers += 1;
    if (authDelayMs > 0) {
      await new Promise((r) => setTimeout(r, authDelayMs));
    }
  }

  console.log(`Auth users created this run: ${createdUsers} | Total resolved: ${emailToUserId.size}`);

  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);

  let profilesUpserted = 0;
  for (const [emailKey, sample] of byEmail) {
    const userId = emailToUserId.get(emailKey);
    if (!userId) die(`Missing user id for ${emailKey}`);

    const phoneDigits = digitsPhone(sample.phone);
    const dob = formatDob(sample.dob);
    const sex = mapSex(sample.sex);
    if (!dob) die(`Bad DOB for ${emailKey}`);
    if (!sex) die(`Bad sex for ${emailKey} (need M/F)`);
    if (phoneDigits.length < 10) die(`Phone needs ≥10 digits: ${emailKey}`);

    const payload = {
      id: userId,
      first_name: String(sample.first_name ?? "").trim(),
      last_name: String(sample.last_name ?? "").trim(),
      email: String(sample.email ?? "").trim(),
      phone: phoneDigits,
      dob,
      sex,
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) die(`profiles upsert ${emailKey}: ${error.message}`);
    profilesUpserted += 1;

    const { error: memErr } = await supabase.from("memberships").upsert(
      {
        user_id: userId,
        status: "active",
        membership_start_at: new Date().toISOString(),
        membership_end_at: end.toISOString(),
        renewal_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (memErr) die(`memberships upsert ${emailKey}: ${memErr.message}`);
  }

  console.log(`Profiles + memberships upserted: ${profilesUpserted}`);

  let inserted = 0;
  let skippedDup = 0;
  let skippedErr = 0;

  for (const row of rows) {
    const emailKey = String(row.email ?? "").trim().toLowerCase();
    const userId = emailToUserId.get(emailKey);
    if (!userId) {
      console.error(`Skip: no user for ${emailKey}`);
      skippedErr += 1;
      continue;
    }

    const eid = String(row.event_id);
    const did = String(row.distance_id);
    const phoneDigits = digitsPhone(row.phone);
    const dob = formatDob(row.dob);
    const sex = mapSex(row.sex);
    const cutoff = cutoffFor(eid, did);

    const entryPayload = {
      event_id: eid,
      user_id: userId,
      distance_id: did,
      first_name: String(row.first_name ?? "").trim(),
      last_name: String(row.last_name ?? "").trim(),
      phone: phoneDigits,
      email: String(row.email ?? "").trim(),
      dob,
      sex,
      bib: row.bib != null && row.bib !== "" ? String(row.bib) : null,
      entry_kind: "free",
      entry_type: "primary",
      source_entry_id: null,
      cutoff_snapshot: cutoff,
      eligible: true,
    };

    const { error } = await supabase.from("entries").insert(entryPayload);

    if (error) {
      if (error.code === "23505" || String(error.message).includes("duplicate")) {
        skippedDup += 1;
        continue;
      }
      console.error(`Insert error ${emailKey} ${did}:`, error.message);
      skippedErr += 1;
      continue;
    }
    inserted += 1;
  }

  console.log(`Entries inserted: ${inserted} | Skipped duplicate: ${skippedDup} | Errors: ${skippedErr}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Finish-time CSV parsing for the results pipeline (step 2).
 *
 * Timing exports vary by vendor (Race Result, RunSignup, hand-typed sheets), so
 * headers are detected loosely and times accept H:MM:SS(.fff), MM:SS, or raw seconds.
 */

export type RawCsvRow = Record<string, string | number | null | undefined>;

export interface ParsedFinishRow {
  /** 1-based data row number in the file (header is row 1). */
  rowNum: number;
  bib: string | null;
  prId: string | null;
  firstName: string | null;
  lastName: string | null;
  timeMs: number | null;
  timeDisplay: string | null;
  /** Why this row can never match (bad time, no identifier, ...). */
  problem: string | null;
}

const BIB_HEADERS = [
  "assigned_bib",
  "assigned bib",
  "bib",
  "bib#",
  "bib #",
  "bib number",
  "bibnumber",
  "race number",
  "racenumber",
  "race no",
  "raceno",
  "number",
];

const PR_ID_HEADERS = ["pr_id", "pr id", "prid", "peer racing id", "peer_racing_id", "pr#"];

const FIRST_HEADERS = ["first_name", "first name", "firstname", "first"];
const LAST_HEADERS = ["last_name", "last name", "lastname", "last", "surname"];
const FULL_NAME_HEADERS = ["name", "athlete", "runner", "participant"];

/** Priority order: chip/net beats gun beats generic. */
const TIME_HEADERS = [
  "chip time",
  "chiptime",
  "chip_time",
  "net time",
  "nettime",
  "net_time",
  "finish_time",
  "finish time",
  "finishtime",
  "gun time",
  "guntime",
  "gun_time",
  "elapsed",
  "result",
  "time",
];

function norm(h: string): string {
  return h.trim().toLowerCase();
}

function findHeader(headers: string[], candidates: string[]): string | null {
  const map = new Map(headers.map((h) => [norm(h), h]));
  for (const c of candidates) {
    const hit = map.get(c);
    if (hit !== undefined) return hit;
  }
  return null;
}

export interface DetectedColumns {
  bib: string | null;
  prId: string | null;
  first: string | null;
  last: string | null;
  fullName: string | null;
  time: string | null;
}

export function detectColumns(headers: string[]): DetectedColumns {
  return {
    bib: findHeader(headers, BIB_HEADERS),
    prId: findHeader(headers, PR_ID_HEADERS),
    first: findHeader(headers, FIRST_HEADERS),
    last: findHeader(headers, LAST_HEADERS),
    fullName: findHeader(headers, FULL_NAME_HEADERS),
    time: findHeader(headers, TIME_HEADERS),
  };
}

const NON_FINISH_VALUES = new Set(["dnf", "dns", "dq", "dsq", "nt", "n/a", "na", "--", "-"]);

/**
 * "1:23:45.6" -> ms; "23:45" -> ms; "5025.3" -> seconds -> ms. Null when not a finish.
 */
export function parseTimeToMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || NON_FINISH_VALUES.has(s.toLowerCase())) return null;

  const parts = s.split(":");
  if (parts.length > 3) return null;

  if (parts.length === 1) {
    const secs = Number(s);
    if (!Number.isFinite(secs) || secs <= 0) return null;
    return Math.round(secs * 1000);
  }

  let h = 0;
  let m = 0;
  let sec = 0;
  if (parts.length === 3) {
    h = Number(parts[0]);
    m = Number(parts[1]);
    sec = Number(parts[2]);
  } else {
    m = Number(parts[0]);
    sec = Number(parts[1]);
  }
  if (![h, m, sec].every((n) => Number.isFinite(n) && n >= 0)) return null;
  if (m >= 60 || sec >= 60) return null;
  const ms = Math.round((h * 3600 + m * 60 + sec) * 1000);
  return ms > 0 ? ms : null;
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function cell(row: RawCsvRow, header: string | null): string | null {
  if (!header) return null;
  const v = row[header];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function splitFullName(full: string): { first: string | null; last: string | null } {
  const t = full.trim().replace(/\s+/g, " ");
  if (!t) return { first: null, last: null };
  // "Last, First" timing exports
  if (t.includes(",")) {
    const [last, first] = t.split(",", 2).map((x) => x.trim());
    return { first: first || null, last: last || null };
  }
  const words = t.split(" ");
  if (words.length === 1) return { first: words[0]!, last: null };
  return { first: words.slice(0, -1).join(" "), last: words[words.length - 1]! };
}

export function parseFinishRows(rawRows: RawCsvRow[], headers: string[]): {
  columns: DetectedColumns;
  rows: ParsedFinishRow[];
} {
  const columns = detectColumns(headers);
  const rows: ParsedFinishRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]!;
    const rowNum = i + 2;

    const bib = cell(raw, columns.bib);
    const prId = cell(raw, columns.prId);
    let firstName = cell(raw, columns.first);
    let lastName = cell(raw, columns.last);
    if (!firstName && !lastName) {
      const full = cell(raw, columns.fullName);
      if (full) {
        const split = splitFullName(full);
        firstName = split.first;
        lastName = split.last;
      }
    }

    const timeRaw = cell(raw, columns.time);
    const timeMs = parseTimeToMs(timeRaw);

    let problem: string | null = null;
    if (!columns.time) {
      problem = "No time column detected in file";
    } else if (timeMs === null) {
      problem = timeRaw ? `Not a finish time: "${timeRaw}"` : "Missing finish time";
    } else if (!bib && !prId && !firstName && !lastName) {
      problem = "No bib, PR ID, or name on this row";
    }

    rows.push({
      rowNum,
      bib,
      prId,
      firstName,
      lastName,
      timeMs,
      timeDisplay: timeMs !== null ? formatMs(timeMs) : timeRaw,
      problem,
    });
  }

  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Matching against entries
// ---------------------------------------------------------------------------

export interface MatchableEntry {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  bib: string | null;
  assigned_bib: string | null;
  pr_id: string | null;
}

/** Digit-only bibs compare with leading zeros stripped ("007" matches "7"). */
function bibKey(v: string): string {
  const t = v.trim();
  if (/^\d+$/.test(t)) return String(Number(t));
  return t.toLowerCase();
}

function nameKey(first: string | null, last: string | null): string | null {
  const f = (first ?? "").trim().toLowerCase();
  const l = (last ?? "").trim().toLowerCase();
  if (!f || !l) return null;
  return `${f}|${l}`;
}

export type MatchMethod = "assigned_bib" | "pr_id" | "bib" | "name";

export interface RowMatch {
  entryId: string;
  method: MatchMethod;
}

/**
 * Match parsed rows to entries. Priority per row: assigned_bib (race-day timing
 * bib) -> PR ID -> lifetime bib -> exact unique full-name. Each entry can take
 * only one row; later duplicates stay unmatched with a note.
 */
export function matchRowsToEntries(
  rows: ParsedFinishRow[],
  entries: MatchableEntry[],
): Map<number, RowMatch | { duplicateOf: number } | null> {
  const byAssignedBib = new Map<string, MatchableEntry>();
  const byPrId = new Map<string, MatchableEntry>();
  const byBib = new Map<string, MatchableEntry>();
  const byName = new Map<string, MatchableEntry[]>();

  for (const e of entries) {
    if (e.assigned_bib?.trim()) byAssignedBib.set(bibKey(e.assigned_bib), e);
    if (e.pr_id?.trim()) byPrId.set(bibKey(e.pr_id), e);
    if (e.bib?.trim()) byBib.set(bibKey(e.bib), e);
    const nk = nameKey(e.first_name, e.last_name);
    if (nk) {
      const list = byName.get(nk) ?? [];
      list.push(e);
      byName.set(nk, list);
    }
  }

  const claimed = new Map<string, number>(); // entryId -> rowNum that claimed it
  const out = new Map<number, RowMatch | { duplicateOf: number } | null>();

  for (const row of rows) {
    if (row.problem) {
      out.set(row.rowNum, null);
      continue;
    }

    let hit: { entry: MatchableEntry; method: MatchMethod } | null = null;

    if (row.bib) {
      const k = bibKey(row.bib);
      const e = byAssignedBib.get(k);
      if (e) hit = { entry: e, method: "assigned_bib" };
      if (!hit) {
        const e2 = byPrId.get(k);
        if (e2) hit = { entry: e2, method: "pr_id" };
      }
      if (!hit) {
        const e3 = byBib.get(k);
        if (e3) hit = { entry: e3, method: "bib" };
      }
    }
    if (!hit && row.prId) {
      const e = byPrId.get(bibKey(row.prId));
      if (e) hit = { entry: e, method: "pr_id" };
    }
    if (!hit) {
      const nk = nameKey(row.firstName, row.lastName);
      if (nk) {
        const list = byName.get(nk);
        if (list && list.length === 1) hit = { entry: list[0]!, method: "name" };
      }
    }

    if (!hit) {
      out.set(row.rowNum, null);
      continue;
    }

    const prior = claimed.get(hit.entry.id);
    if (prior !== undefined) {
      out.set(row.rowNum, { duplicateOf: prior });
      continue;
    }
    claimed.set(hit.entry.id, row.rowNum);
    out.set(row.rowNum, { entryId: hit.entry.id, method: hit.method });
  }

  return out;
}

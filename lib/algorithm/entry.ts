/**
 * Port of the Entry dataclass and row/time parsing from
 * 26_PR Program/src/peer_racing_algorithm.py — behavior preserved exactly.
 */

export class AlgorithmEntry {
  payout = 0.0;
  incentivePayout1 = 0.0;
  incentivePayout2 = 0.0;
  incentivePayout3 = 0.0;

  constructor(
    public id: string,
    public bibNumber: string,
    public firstName: string,
    public lastName: string,
    public age: number,
    /** Normalized to 'Male' | 'Female' at parse time, matching parse_row. */
    public sex: string,
    /** Finish time in whole seconds (Python drops sub-second remainder). */
    public timeS: number,
    public overallRank: number,
    public peerRacingRank: string,
    public timeRaw: string,
    public military: boolean = false,
  ) {}

  getIncentivePayout(div: number): number {
    if (div === 0) return this.incentivePayout1;
    if (div === 1) return this.incentivePayout2;
    return this.incentivePayout3;
  }

  setIncentivePayout(div: number, payout: number): void {
    if (div === 0) this.incentivePayout1 = payout;
    else if (div === 1) this.incentivePayout2 = payout;
    else if (div === 2) this.incentivePayout3 = payout;
    else throw new Error(`Invalid Value for incentive_run argument ${div}`);
  }

  isFemale(): boolean {
    return this.sex.includes("f") || this.sex.includes("F");
  }

  isMilitary(): boolean {
    return this.military;
  }

  timeH(): number {
    return this.timeS / 3600.0;
  }

  /** Entry.set_division — e.g. "Alpha3"; payout loop later overwrites winners to "Alpha 3". */
  setDivision(div: string, place: number): void {
    this.peerRacingRank = `${div}${place}`;
  }
}

/**
 * Parse a finish-time string to whole seconds.
 *
 * Mirrors parse_row + get_time/get_time_old_style: strptime against '%H:%M:%S.%f'
 * (falling back to minutes/seconds-only) drops fractional seconds via `.seconds`;
 * the old-style ':'-weighted fallback handles values out of strptime field ranges.
 * Returns null when the string is unparseable (e.g. a header row).
 */
export function parseFinishTimeSeconds(raw: string): number | null {
  let timeStr = raw.replace(/[\r\n ]+$/g, "").replace(/^[\r\n ]+/g, "");
  if (!timeStr.includes(".")) timeStr = timeStr + ".0";

  // strptime path: H:M:S.f / M:S.f / S.f with strptime's field ranges.
  const m = timeStr.match(/^(?:(\d{1,2}):)?(?:(\d{1,2}):)?(\d{1,2})\.(\d+)$/);
  if (m) {
    const a = m[1] !== undefined ? parseInt(m[1], 10) : null;
    const b = m[2] !== undefined ? parseInt(m[2], 10) : null;
    const s = parseInt(m[3], 10);
    let hours = 0;
    let minutes = 0;
    if (a !== null && b !== null) {
      hours = a;
      minutes = b;
    } else if (a !== null) {
      minutes = a;
    }
    const inRange = hours <= 23 && minutes <= 59 && s <= 61;
    if (inRange) {
      return hours * 3600 + minutes * 60 + s;
    }
  }

  // get_time_old_style fallback: split on ':' weighted [1, 60, 3600].
  const parts = timeStr.split(":");
  if (parts.length > 3) return null;
  const weights = [1, 60, 3600];
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const v = parseFloat(parts[parts.length - 1 - i]);
    if (Number.isNaN(v)) return null;
    total += v * weights[i];
  }
  return total;
}

export interface ParseIndices {
  id: number;
  bib: number;
  first: number;
  last: number;
  age: number;
  sex: number;
  time: number;
  military: number;
}

/**
 * parse_row: build an AlgorithmEntry from a CSV row, or null on failure (rows that
 * fail to parse — like header rows — are skipped, exactly as in Python).
 */
export function parseRow(row: string[], indices: ParseIndices): AlgorithmEntry | null {
  try {
    const timeS = parseFinishTimeSeconds(row[indices.time]);
    if (timeS === null) return null;

    let military = false;
    if (indices.military >= 0) {
      const v = (row[indices.military] ?? "").toUpperCase();
      // Python: `if (v != '0') or ('T' in v)` — anything other than '0' counts as true.
      if (v !== "0" || v.includes("T")) military = true;
    }

    const age = parseInt(row[indices.age], 10);
    if (Number.isNaN(age)) return null;

    return new AlgorithmEntry(
      row[indices.id],
      row[indices.bib],
      row[indices.first],
      row[indices.last],
      age,
      row[indices.sex].toUpperCase().includes("F") ? "Female" : "Male",
      timeS,
      // safe_get_index() in Python always returns its default due to a type() quirk,
      // so overall_rank is always -1 and peer_racing_rank always "" at parse time.
      -1,
      "",
      row[indices.time],
      military,
    );
  } catch {
    return null;
  }
}

/** state.sort_entries: sort ascending by time (stable) and assign 1-based overall rank. */
export function sortEntries(entries: AlgorithmEntry[]): void {
  entries.sort((a, b) => a.timeS - b.timeS);
  entries.forEach((e, i) => {
    e.overallRank = i + 1;
  });
}

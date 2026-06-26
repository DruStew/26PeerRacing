/**
 * Calendar + datetime-local helpers. Date-only strings (YYYY-MM-DD) must not use
 * `new Date("YYYY-MM-DD")` — that parses as UTC midnight and shifts the calendar day in US timezones.
 */

/**
 * Parse a calendar date string (YYYY-MM-DD prefix) to a Date at **local noon**.
 */
export function localNoonFromDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    mo < 1 ||
    mo > 12 ||
    d < 1 ||
    d > 31
  ) {
    return null;
  }
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

/**
 * Value for `<input type="datetime-local" />` from a stored ISO / timestamptz string.
 * Uses local wall time (not `toISOString()`, which is UTC and breaks the input).
 */
export function toDatetimeLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return formatDateToDatetimeLocal(d);
}

function formatDateToDatetimeLocal(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${min}`;
}

/** Entry deadline datetime-local value N minutes before a gun datetime-local value. */
export function entryDeadlineDatetimeLocalFromGun(
  gunDatetimeLocal: string,
  minutesBefore = 30,
): string {
  const trimmed = gunDatetimeLocal.trim();
  if (!trimmed) return "";
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - minutesBefore);
  return formatDateToDatetimeLocal(d);
}

/** Existing entry deadline, or gun time minus N minutes when unset. */
export function datetimeLocalInputValueOrEntryDeadlineFromGun(
  prCutoffIso: string | null | undefined,
  gunIso: string | null | undefined,
  raceDate: string | null | undefined,
  defaultGunHour = 8,
  defaultGunMinute = 0,
  minutesBefore = 30,
): string {
  const existingCutoff = toDatetimeLocalInputValue(prCutoffIso);
  if (existingCutoff) return existingCutoff;

  const gunLocal =
    toDatetimeLocalInputValue(gunIso) ||
    defaultDatetimeLocalFromRaceDay(raceDate, defaultGunHour, defaultGunMinute);
  if (!gunLocal) return "";

  return entryDeadlineDatetimeLocalFromGun(gunLocal, minutesBefore);
}

/**
 * Default `<input type="datetime-local" />` value from a calendar race day (YYYY-MM-DD).
 * Uses local wall time; defaults to 08:00 when hour/minute are omitted.
 */
export function defaultDatetimeLocalFromRaceDay(
  raceDate: string | null | undefined,
  hour = 8,
  minute = 0,
): string {
  const d = localNoonFromDateOnly(raceDate);
  if (!d) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${min}`;
}

/** Existing datetime-local value, or race-day default when unset. */
export function datetimeLocalInputValueOrRaceDayDefault(
  iso: string | null | undefined,
  raceDate: string | null | undefined,
  hour = 8,
  minute = 0,
): string {
  const existing = toDatetimeLocalInputValue(iso);
  if (existing) return existing;
  return defaultDatetimeLocalFromRaceDay(raceDate, hour, minute);
}

/**
 * Format an ISO instant for display in the runtime's local timezone.
 */
export function formatDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${min}`;
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

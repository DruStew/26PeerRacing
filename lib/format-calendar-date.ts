/**
 * Format a Postgres `date` or ISO calendar string (YYYY-MM-DD) for display.
 * Avoid `new Date("YYYY-MM-DD")` — that is parsed as UTC midnight and
 * `toLocaleDateString()` can show the previous/next calendar day in local timezones.
 */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
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
      return s;
    }
    const local = new Date(y, mo - 1, d);
    return local.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

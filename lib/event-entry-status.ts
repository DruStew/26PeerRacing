/**
 * Whether the event's final day (end_date for multi-day, else race_date) is
 * over. Events stay on Find a Race through their last race day to promote
 * walk-up entries; the buffer covers end-of-day in any US timezone since we
 * don't store the event's timezone with the calendar date.
 */
export function finalDayIsOver(event: {
  race_date: string | null;
  end_date?: string | null;
}): boolean {
  const finalDay = event.end_date?.trim() || event.race_date?.trim() || null;
  if (!finalDay) return false;
  const endUtc = Date.parse(`${finalDay}T23:59:59Z`);
  if (Number.isNaN(endUtc)) return false;
  const US_WESTMOST_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
  return Date.now() > endUtc + US_WESTMOST_UTC_OFFSET_MS;
}

/**
 * Whether at least one race distance still accepts entries (matches enter API cutoff logic).
 * Publishing results closes a distance for good, regardless of its entry deadline.
 */
export function areEntriesOpenForEvent(
  eventPrCutoff: string | null,
  distances: { pr_cutoff: string | null; results_published_at?: string | null }[],
): boolean {
  const now = Date.now();
  const eventCut = eventPrCutoff ? new Date(eventPrCutoff) : null;
  const defaultCutoff =
    eventCut && !Number.isNaN(eventCut.getTime()) ? eventCut : null;

  if (distances.length === 0) {
    if (!defaultCutoff) return true;
    return now <= defaultCutoff.getTime();
  }

  return distances.some((d) => {
    if (d.results_published_at) return false;
    const dCut = d.pr_cutoff ? new Date(d.pr_cutoff) : null;
    const eff =
      dCut && !Number.isNaN(dCut.getTime()) ? dCut : defaultCutoff;
    if (!eff || Number.isNaN(eff.getTime())) return true;
    return now <= eff.getTime();
  });
}

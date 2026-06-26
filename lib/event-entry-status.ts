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

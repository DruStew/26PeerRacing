/**
 * Whether at least one race distance still accepts entries (matches enter API cutoff logic).
 */
export function areEntriesOpenForEvent(
  eventPrCutoff: string | null,
  distances: { pr_cutoff: string | null }[],
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
    const dCut = d.pr_cutoff ? new Date(d.pr_cutoff) : null;
    const eff =
      dCut && !Number.isNaN(dCut.getTime()) ? dCut : defaultCutoff;
    if (!eff || Number.isNaN(eff.getTime())) return true;
    return now <= eff.getTime();
  });
}

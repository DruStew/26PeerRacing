/**
 * Whether a single distance's registration is still open (aligns with enter API / RLS).
 */
export function isDistanceEntryOpen(
  eventPrCutoff: string | null,
  distancePrCutoff: string | null,
): boolean {
  const eff =
    distancePrCutoff && distancePrCutoff.trim() !== ""
      ? new Date(distancePrCutoff)
      : eventPrCutoff && eventPrCutoff.trim() !== ""
        ? new Date(eventPrCutoff)
        : null;

  if (!eff || Number.isNaN(eff.getTime())) return true;
  return Date.now() <= eff.getTime();
}

export type CarryOverEntryLike = {
  id: string;
  entry_type: string;
  source_entry_id: string | null;
  distance_label?: string;
};

export function isCarryOverEntryLike(entry: CarryOverEntryLike): boolean {
  return entry.entry_type === "roll_over";
}

/** Primary + Carry-Over splits that share one physical start (linked check-in group). */
export function carryOverLinkedEntries(
  entries: CarryOverEntryLike[],
  entryId: string,
): CarryOverEntryLike[] {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return [];

  const primaryId =
    isCarryOverEntryLike(entry) && entry.source_entry_id ? entry.source_entry_id : entry.id;

  const linked = entries.filter(
    (e) =>
      e.id === primaryId ||
      (isCarryOverEntryLike(e) && e.source_entry_id === primaryId),
  );

  return linked.length > 0 ? linked : [entry];
}

export function carryOverLinkedEntryIds(entries: CarryOverEntryLike[], entryId: string): string[] {
  return carryOverLinkedEntries(entries, entryId).map((e) => e.id);
}

export function hasCarryOverLink(entries: CarryOverEntryLike[], entryId: string): boolean {
  return carryOverLinkedEntries(entries, entryId).length > 1;
}

export function carryOverLinkedLabels(entries: CarryOverEntryLike[], entryId: string): string[] {
  return carryOverLinkedEntries(entries, entryId)
    .map((e) => e.distance_label?.trim())
    .filter((label): label is string => Boolean(label));
}

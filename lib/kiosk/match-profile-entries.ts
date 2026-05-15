/**
 * Match event entry rows to the same profile as My Entries (user_id on entry, or legacy null + email).
 */
export type EntryLike = {
  user_id?: string | null;
  email?: string | null;
};

export function filterEntriesForProfile<T extends EntryLike>(
  entries: T[],
  profile: { id: string; email?: string | null },
): T[] {
  const pEmail = profile.email?.trim().toLowerCase() ?? "";
  return entries.filter((e) => {
    if (e.user_id === profile.id) return true;
    if (!e.user_id && pEmail && e.email?.trim().toLowerCase() === pEmail) return true;
    return false;
  });
}

/**
 * When search RPC omits user_id, infer the auth user from any entry in this event with same email + user_id set
 * (same person as My Entries).
 */
export function inferProfileIdFromEventEntries<T extends EntryLike>(
  emailRaw: string | null | undefined,
  eventEntries: T[],
): string | null {
  const emailNorm = emailRaw?.trim().toLowerCase() ?? "";
  if (!emailNorm) return null;
  const hit = eventEntries.find(
    (e) => e.email?.trim().toLowerCase() === emailNorm && e.user_id,
  );
  return (hit?.user_id as string | undefined) ?? null;
}

/** Count rows for kiosk search (aligned with filterEntriesForProfile once profile id is known). */
export function countEntriesForKioskRow<T extends EntryLike & { distance_id?: string }>(
  eventEntries: T[],
  row: { user_id?: string | null; email?: string | null },
): { count: number; distanceIds: Set<string> } {
  const emailNorm = row.email?.trim().toLowerCase() ?? "";
  const uid =
    (typeof row.user_id === "string" && row.user_id.trim() !== ""
      ? row.user_id
      : null) ?? inferProfileIdFromEventEntries(row.email, eventEntries);

  const matched = eventEntries.filter((e) => {
    if (uid && e.user_id === uid) return true;
    if (!e.user_id && emailNorm && e.email?.trim().toLowerCase() === emailNorm) return true;
    return false;
  });
  const distanceIds = new Set(matched.map((e) => e.distance_id).filter(Boolean) as string[]);
  return { count: matched.length, distanceIds };
}

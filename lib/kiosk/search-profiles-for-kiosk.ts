import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type KioskMemberSearchRow = {
  kind: "member";
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  pr_id: string | null;
  entry_count: number;
  distance_summary: string | null;
};

export async function searchProfilesForKiosk(
  admin: SupabaseClient,
  eventId: string,
  q: string,
  limit = 15,
): Promise<KioskMemberSearchRow[]> {
  const safe = q.replace(/%/g, "\\%").replace(/_/g, "\\_").trim();
  if (safe.length < 2) return [];

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,first_name,last_name,email,phone,pr_id")
    .or(
      `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,pr_id.ilike.%${safe}%`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !profiles?.length) return [];

  const userIds = profiles.map((p) => (p as { id: string }).id);
  const { data: eventEntries } = await admin
    .from("entries")
    .select("user_id,distance_id")
    .eq("event_id", eventId)
    .in("user_id", userIds);

  const { data: distRows } = await admin
    .from("distances")
    .select("id,label,race_name")
    .eq("event_id", eventId);

  const distLabel = new Map(
    (distRows ?? []).map((d) => {
      const row = d as { id: string; label: string | null; race_name?: string | null };
      const label = row.race_name?.trim()
        ? `${row.race_name.trim()} — ${row.label ?? "Race"}`
        : row.label ?? "Race";
      return [row.id, label] as const;
    }),
  );

  const entriesByUser = new Map<string, string[]>();
  for (const e of eventEntries ?? []) {
    const uid = (e as { user_id: string }).user_id;
    const did = (e as { distance_id: string }).distance_id;
    const arr = entriesByUser.get(uid) ?? [];
    const label = distLabel.get(did);
    if (label) arr.push(label);
    entriesByUser.set(uid, arr);
  }

  return profiles.map((p) => {
    const row = p as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      pr_id: string | null;
    };
    const labels = entriesByUser.get(row.id) ?? [];
    return {
      kind: "member" as const,
      user_id: row.id,
      first_name: row.first_name ?? "",
      last_name: row.last_name ?? "",
      email: row.email,
      phone: row.phone,
      pr_id: row.pr_id,
      entry_count: labels.length,
      distance_summary: labels.length ? labels.join(" · ") : null,
    };
  });
}

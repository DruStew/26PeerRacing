import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "PR Results powered by" sponsor logo resolution.
 * A distance uses its own logo when set; otherwise it inherits the first
 * logo found among the event's distances (by sort order) — so one upload
 * covers a 5-distance event unless the promoter overrides per distance.
 */
export async function resolveSponsorLogo(
  service: SupabaseClient,
  eventId: string,
  distanceId: string,
): Promise<string | null> {
  const { data } = await service
    .from("distances")
    .select("id,share_sponsor_logo_url,sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  const rows = (data ?? []) as Array<{ id: string; share_sponsor_logo_url: string | null }>;
  const own = rows.find((r) => r.id === distanceId)?.share_sponsor_logo_url;
  if (own) return own;
  return rows.find((r) => r.share_sponsor_logo_url)?.share_sponsor_logo_url ?? null;
}

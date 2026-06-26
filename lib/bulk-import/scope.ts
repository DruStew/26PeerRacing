import type { SupabaseClient } from "@supabase/supabase-js";

import { canManageEvent } from "@/lib/promoter/event-access";

/**
 * Admin (role row) or the event's promoter may run bulk import for that event.
 */
export async function canUserBulkImportForEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const { data: ev, error } = await supabase
    .from("events")
    .select("promoter_id")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !ev) return false;
  return canManageEvent(supabase, userId, (ev as { promoter_id: string }).promoter_id);
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin (role row) or the event's promoter may run bulk import for that event.
 */
export async function canUserBulkImportForEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const { data: adminRows } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");

  if (adminRows && adminRows.length > 0) return true;

  const { data: ev, error } = await supabase
    .from("events")
    .select("promoter_id")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !ev) return false;
  return (ev as { promoter_id: string }).promoter_id === userId;
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Walk-up kiosk: after entry + payment, mark all unchecked entries for this runner at the event as checked in.
 */
export async function kioskAutoCheckInWalkUpRunner(
  admin: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<{ checkedInCount: number; entryIds: string[] }> {
  const { data: entries, error } = await admin
    .from("entries")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .is("kiosk_checked_in_at", null);

  if (error || !entries?.length) {
    return { checkedInCount: 0, entryIds: [] };
  }

  const entryIds: string[] = [];
  for (const row of entries) {
    const entryId = (row as { id: string }).id;
    const { data: rpcRows, error: rpcError } = await admin.rpc("kiosk_confirm_entry_check_in", {
      p_event_id: eventId,
      p_entry_id: entryId,
    });
    if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
      entryIds.push(entryId);
    }
  }

  return { checkedInCount: entryIds.length, entryIds };
}

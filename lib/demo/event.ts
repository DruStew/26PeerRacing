import type { SupabaseClient } from "@supabase/supabase-js";

/** Load whether an event is a super-admin demo sandbox. */
export async function loadEventIsDemo(
  client: SupabaseClient,
  eventId: string,
): Promise<boolean> {
  const { data } = await client.from("events").select("is_demo").eq("id", eventId).maybeSingle();
  return (data as { is_demo?: boolean } | null)?.is_demo === true;
}

export async function isSuperAdmin(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await client
    .from("roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  return Boolean(data);
}

export const DEMO_PUBLISH_BLOCKED =
  "Demo races cannot publish results — use the Results Console preview only. Delete the demo when finished.";

export const DEMO_EVENT_PUBLISH_BLOCKED =
  "Demo races stay off the public calendar. Use this sandbox to walk a producer through the tools.";

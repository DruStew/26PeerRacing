import type { SupabaseClient } from "@supabase/supabase-js";

/** Global admin or super admin — may manage any promoter's event tools. */
export async function isPlatformAdminForPromoterTools(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function canManageEvent(
  supabase: SupabaseClient,
  userId: string,
  eventPromoterId: string | null | undefined,
): Promise<boolean> {
  if (eventPromoterId && userId === eventPromoterId) return true;
  return isPlatformAdminForPromoterTools(supabase, userId);
}

/** Load event row and verify the user may manage it (promoter owner or platform admin). */
export async function loadEventForPromoterTools(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  select = "id,name,promoter_id",
): Promise<
  | { ok: true; event: Record<string, unknown> & { id: string; promoter_id: string } }
  | { ok: false; reason: "not_found" | "forbidden" }
> {
  const { data: event, error } = await supabase.from("events").select(select).eq("id", eventId).single();
  if (error || !event) return { ok: false, reason: "not_found" };
  const promoterId = (event as { promoter_id: string }).promoter_id;
  if (!(await canManageEvent(supabase, userId, promoterId))) {
    return { ok: false, reason: "forbidden" };
  }
  return {
    ok: true,
    event: event as Record<string, unknown> & { id: string; promoter_id: string },
  };
}

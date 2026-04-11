"use server";

import { revalidatePath } from "next/cache";

import { GLOBAL_ROLE_SCOPE_ID } from "@/lib/admin/constants";
import type { ManageableRole } from "@/lib/admin/member-roles";
import { requireAdmin } from "@/lib/admin/require-admin";

export async function setGlobalRole(
  targetUserId: string,
  role: ManageableRole,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await requireAdmin("/admin/members");

  if (!enabled && role === "admin") {
    const { data: adminRows } = await supabase.from("roles").select("user_id").eq("role", "admin");
    const unique = [...new Set((adminRows ?? []).map((r) => r.user_id as string))];
    if (unique.length === 1 && unique[0] === targetUserId) {
      return { ok: false, error: "Cannot remove the only admin account." };
    }
  }

  if (enabled) {
    const { data: existing } = await supabase
      .from("roles")
      .select("scope_event_id")
      .eq("user_id", targetUserId)
      .eq("role", role);

    const already = (existing ?? []).some(
      (row) =>
        row.scope_event_id == null || row.scope_event_id === GLOBAL_ROLE_SCOPE_ID,
    );
    if (already) {
      revalidatePath("/admin/members");
      return { ok: true };
    }

    const { error } = await supabase.from("roles").insert({
      user_id: targetUserId,
      role,
      scope_event_id: GLOBAL_ROLE_SCOPE_ID,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
  } else {
    const { error: e1 } = await supabase
      .from("roles")
      .delete()
      .eq("user_id", targetUserId)
      .eq("role", role)
      .eq("scope_event_id", GLOBAL_ROLE_SCOPE_ID);

    const { error: e2 } = await supabase
      .from("roles")
      .delete()
      .eq("user_id", targetUserId)
      .eq("role", role)
      .is("scope_event_id", null);

    if (e1 && e2) {
      return { ok: false, error: e1.message || e2.message };
    }
  }

  revalidatePath("/admin/members");
  return { ok: true };
}

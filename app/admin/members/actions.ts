"use server";

import { revalidatePath } from "next/cache";

import { GLOBAL_ROLE_SCOPE_ID } from "@/lib/admin/constants";
import type { ManageableRole } from "@/lib/admin/member-roles";
import { SUPER_ADMIN_ONLY_ROLES } from "@/lib/admin/platform-roles";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

async function countGlobalRoleHolders(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  role: "admin" | "super_admin",
): Promise<number> {
  const { data } = await supabase.from("roles").select("user_id").eq("role", role);
  const ids = new Set(
    (data ?? [])
      .filter(
        (r) =>
          (r as { scope_event_id?: string | null }).scope_event_id == null ||
          (r as { scope_event_id?: string | null }).scope_event_id === GLOBAL_ROLE_SCOPE_ID,
      )
      .map((r) => r.user_id as string),
  );
  return ids.size;
}

export async function setGlobalRole(
  targetUserId: string,
  role: ManageableRole,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, admin } = await requireAdmin("/admin/members");

  if (SUPER_ADMIN_ONLY_ROLES.has(role) && !admin.isSuperAdmin) {
    return { ok: false, error: "Only Super Admin can change Admin or Super Admin roles." };
  }

  if (!enabled && role === "super_admin") {
    const count = await countGlobalRoleHolders(supabase, "super_admin");
    if (count <= 1) {
      const { data: holders } = await supabase
        .from("roles")
        .select("user_id")
        .eq("role", "super_admin");
      const only = (holders ?? [])[0]?.user_id as string | undefined;
      if (only === targetUserId) {
        return { ok: false, error: "Cannot remove the only Super Admin account." };
      }
    }
  }

  if (!enabled && role === "admin") {
    const adminCount = await countGlobalRoleHolders(supabase, "admin");
    const superCount = await countGlobalRoleHolders(supabase, "super_admin");
    if (adminCount <= 1 && superCount === 0) {
      const { data: holders } = await supabase
        .from("roles")
        .select("user_id")
        .eq("role", "admin");
      const only = (holders ?? [])[0]?.user_id as string | undefined;
      if (only === targetUserId) {
        return { ok: false, error: "Cannot remove the only platform admin account." };
      }
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

export async function setMemberMembershipTier(
  targetUserId: string,
  tierSlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await requireAdmin("/admin/members");

  const slug = tierSlug.trim();
  if (!slug) {
    return { ok: false, error: "Select a membership tier." };
  }

  const { data: tierRow, error: tierErr } = await supabase
    .from("membership_tier_config")
    .select("slug, is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (tierErr || !tierRow?.is_active) {
    return { ok: false, error: "Unknown or inactive membership tier." };
  }

  const patch: Record<string, unknown> = {
    tier: slug,
    updated_at: new Date().toISOString(),
  };

  if (slug === "free") {
    patch.membership_end_at = null;
    patch.stripe_subscription_id = null;
  } else {
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    patch.membership_end_at = end.toISOString();
    patch.status = "active";
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }

  if (existing) {
    const { data: updated, error } = await supabase
      .from("memberships")
      .update(patch)
      .eq("user_id", targetUserId)
      .select("user_id")
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!updated) {
      return { ok: false, error: "Could not update membership. Try again or contact support." };
    }
  } else {
    const service = createServiceRoleSupabaseClient();
    if (!service) {
      return { ok: false, error: "Server cannot create a membership record." };
    }

    const endAt =
      slug === "free"
        ? null
        : (() => {
            const end = new Date();
            end.setFullYear(end.getFullYear() + 1);
            return end.toISOString();
          })();

    const { error } = await service.from("memberships").insert({
      user_id: targetUserId,
      status: "active",
      tier: slug,
      membership_start_at: new Date().toISOString(),
      membership_end_at: endAt,
      renewal_count: 0,
      updated_at: patch.updated_at as string,
      stripe_subscription_id: null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
  }

  revalidatePath("/admin/members");
  return { ok: true };
}

export async function saveMemberAccountSettings(
  targetUserId: string,
  settings: {
    superAdmin: boolean;
    admin: boolean;
    promoter: boolean;
    booth: boolean;
    tierSlug: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin("/admin/members");

  const roleUpdates: { role: ManageableRole; enabled: boolean }[] = [
    { role: "super_admin", enabled: settings.superAdmin },
    { role: "admin", enabled: settings.admin },
    { role: "promoter", enabled: settings.promoter },
    { role: "booth", enabled: settings.booth },
  ];

  for (const { role, enabled } of roleUpdates) {
    const result = await setGlobalRole(targetUserId, role, enabled);
    if (!result.ok) {
      return result;
    }
  }

  return setMemberMembershipTier(targetUserId, settings.tierSlug);
}

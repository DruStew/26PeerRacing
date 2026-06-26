import "server-only";

import { redirect } from "next/navigation";

import {
  globalRoleFlags,
  hasPlatformAdminAccess,
  type PlatformRoleFlags,
} from "@/lib/admin/platform-roles";
import { GLOBAL_ROLE_SCOPE_ID } from "@/lib/admin/constants";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ADMIN_BASE = "/admin";

export type AdminSession = {
  userId: string;
  email: string | undefined;
  roles: PlatformRoleFlags;
  isSuperAdmin: boolean;
};

async function loadPlatformRoles(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<PlatformRoleFlags> {
  const { data: roleRows, error } = await supabase
    .from("roles")
    .select("role, scope_event_id")
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin", "promoter", "booth"]);

  if (error) {
    console.error("[admin] roles lookup failed", error.message);
    redirect(DEFAULT_PUBLIC_ROUTE);
  }

  return globalRoleFlags(roleRows ?? []);
}

/**
 * Loads the current user and verifies a global `admin` or `super_admin` role row exists.
 * Redirects to login or home when unauthorized.
 */
export async function requireAdmin(returnPath: string = ADMIN_BASE): Promise<{
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  admin: AdminSession;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(returnPath)}`);
  }

  const roles = await loadPlatformRoles(supabase, user.id);

  if (!hasPlatformAdminAccess(roles)) {
    redirect(DEFAULT_PUBLIC_ROUTE);
  }

  return {
    supabase,
    admin: {
      userId: user.id,
      email: user.email ?? undefined,
      roles,
      isSuperAdmin: roles.superAdmin,
    },
  };
}

/** Only Super Admin may manage admin roles and membership tier structure. */
export async function requireSuperAdmin(returnPath: string = ADMIN_BASE): Promise<{
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  admin: AdminSession;
}> {
  const session = await requireAdmin(returnPath);
  if (!session.admin.isSuperAdmin) {
    redirect(DEFAULT_PUBLIC_ROUTE);
  }
  return session;
}

export { GLOBAL_ROLE_SCOPE_ID };

import "server-only";

import { GLOBAL_ROLE_SCOPE_ID } from "@/lib/admin/constants";

export type GlobalPlatformRole = "super_admin" | "admin" | "promoter" | "booth";

export type PlatformRoleFlags = {
  superAdmin: boolean;
  admin: boolean;
  promoter: boolean;
  booth: boolean;
};

export function isGlobalScopedRole(scopeEventId: string | null | undefined): boolean {
  return scopeEventId == null || scopeEventId === GLOBAL_ROLE_SCOPE_ID;
}

export function globalRoleFlags(
  roleRows: { role: string; scope_event_id: string | null }[],
): PlatformRoleFlags {
  const global = roleRows.filter((r) => isGlobalScopedRole(r.scope_event_id));
  return {
    superAdmin: global.some((r) => r.role === "super_admin"),
    admin: global.some((r) => r.role === "admin"),
    promoter: global.some((r) => r.role === "promoter"),
    booth: global.some((r) => r.role === "booth"),
  };
}

export function hasPlatformAdminAccess(flags: PlatformRoleFlags): boolean {
  return flags.superAdmin || flags.admin;
}

/** Privileged roles only Super Admin may grant or revoke. */
export const SUPER_ADMIN_ONLY_ROLES = new Set<GlobalPlatformRole>(["super_admin", "admin"]);

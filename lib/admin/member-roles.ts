import type { GlobalPlatformRole } from "@/lib/admin/platform-roles";

/** Subset of `public.roles.role` values manageable from the admin UI (global scope). */
export type ManageableRole = GlobalPlatformRole;

export const PRIVILEGED_MANAGEABLE_ROLES: ManageableRole[] = ["super_admin", "admin"];

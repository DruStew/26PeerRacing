import "server-only";

import { redirect } from "next/navigation";

import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { isFinanceAdmin } from "./finance-access";
import { requireAdmin, type AdminSession } from "./require-admin";

/**
 * Finance dashboard: global admin role + email allowlist (drujstew@gmail.com by default).
 * Grant access by adding emails to FINANCE_ADMIN_EMAILS env or finance-access.ts.
 */
export async function requireFinanceAdmin(returnPath: string = "/admin/finance"): Promise<{
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  admin: AdminSession;
}> {
  const { supabase, admin } = await requireAdmin(returnPath);

  if (!isFinanceAdmin(admin.email)) {
    redirect(DEFAULT_PUBLIC_ROUTE);
  }

  return { supabase, admin };
}

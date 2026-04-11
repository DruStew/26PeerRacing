import "server-only";

import { redirect } from "next/navigation";

import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ADMIN_BASE = "/admin";

export type AdminSession = {
  userId: string;
  email: string | undefined;
};

/**
 * Loads the current user and verifies a global `admin` role row exists.
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

  const { data: adminRows, error } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin");

  if (error) {
    console.error("[admin] roles lookup failed", error.message);
    redirect(DEFAULT_PUBLIC_ROUTE);
  }

  if (!adminRows?.length) {
    redirect(DEFAULT_PUBLIC_ROUTE);
  }

  return {
    supabase,
    admin: { userId: user.id, email: user.email ?? undefined },
  };
}

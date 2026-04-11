import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client with the service role key. Use only in trusted API routes
 * (e.g. bulk import). Never import from client components.
 */
export function createServiceRoleSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

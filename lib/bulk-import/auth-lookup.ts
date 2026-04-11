import type { SupabaseClient } from "@supabase/supabase-js";

import { normEmail } from "./helpers";

/** Matches PROFILE_CHUNK in engine: one RPC per batch, not one per email. */
const AUTH_EMAIL_LOOKUP_CHUNK = 250;

/** Safety cap for listUsers fallback (1000 users/page). */
const LIST_USERS_FALLBACK_MAX_PAGES = 150;

export type AuthLookupResult =
  | { ok: true; map: Map<string, string> }
  | { ok: false; message: string };

function rpcMissingLikeMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("could not find the function") ||
    m.includes("does not exist") ||
    m.includes("pgrst")
  );
}

/**
 * When PostgREST does not see the RPC: scan admin listUsers until every requested
 * email that exists in Auth is found, or we run out of pages. Emails not in Auth are
 * simply absent from the map (createUser handles them later).
 */
async function batchResolveAuthUserIdsByListUsers(
  service: SupabaseClient,
  emails: string[],
): Promise<AuthLookupResult> {
  const stillNeed = new Set(emails.map((e) => normEmail(e)).filter(Boolean));
  const map = new Map<string, string>();
  if (stillNeed.size === 0) return { ok: true, map };

  const perPage = 1000;

  for (let page = 1; page <= LIST_USERS_FALLBACK_MAX_PAGES; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { ok: false, message: `Auth user lookup (fallback): ${error.message}` };
    }
    const users = (data?.users ?? []) as { id?: string; email?: string }[];
    for (const u of users) {
      const em = normEmail(u.email);
      if (em && stillNeed.has(em) && u.id) {
        map.set(em, u.id);
        stillNeed.delete(em);
      }
    }
    if (stillNeed.size === 0) break;
    if (users.length < perPage) break;
  }

  return { ok: true, map };
}

/**
 * Resolve `auth.users` ids by exact email (case-insensitive), batched for large imports.
 * Prefer RPC (indexed); if PostgREST has not picked up the function, use one listUsers
 * scan for the whole batch (early exit when possible).
 */
export async function batchResolveAuthUserIdsByEmail(
  service: SupabaseClient,
  emails: string[],
): Promise<AuthLookupResult> {
  const merged = new Map<string, string>();
  if (emails.length === 0) return { ok: true, map: merged };

  for (let i = 0; i < emails.length; i += AUTH_EMAIL_LOOKUP_CHUNK) {
    const chunk = emails.slice(i, i + AUTH_EMAIL_LOOKUP_CHUNK);
    const { data, error } = await service.rpc("admin_auth_user_ids_by_emails", {
      emails: chunk,
    });

    if (!error) {
      for (const row of data ?? []) {
        const r = row as { email: string; user_id: string };
        const key = normEmail(r.email);
        if (key && r.user_id) merged.set(key, r.user_id);
      }
      continue;
    }

    if (rpcMissingLikeMessage(error.message)) {
      return batchResolveAuthUserIdsByListUsers(service, emails);
    }
    return { ok: false, message: `Auth user lookup: ${error.message}` };
  }

  return { ok: true, map: merged };
}

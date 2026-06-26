import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sends a Peer Racing magic-link email via GoTrue (same as /login signInWithOtp).
 */
export async function sendPeerRacingMagicLinkEmail(args: {
  email: string;
  redirectTo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { ok: false, error: "Auth is not configured." };
  }

  const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      email: args.email.trim().toLowerCase(),
      create_user: false,
      data: {},
      gotrue_meta_security: {},
      options: { emailRedirectTo: args.redirectTo },
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { msg?: string; error_description?: string };
    const msg = body.msg ?? body.error_description ?? `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }

  return { ok: true };
}

export function kioskMagicLinkRedirect(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?returnUrl=${encodeURIComponent("/membership/welcome")}`;
}

export async function resolveUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const { data: exact } = await admin.from("profiles").select("id").eq("email", normalized).limit(2);
  if (exact?.length === 1) return (exact[0] as { id: string }).id;

  const { data: ilike } = await admin.from("profiles").select("id").ilike("email", normalized).limit(2);
  if (ilike?.length === 1) return (ilike[0] as { id: string }).id;

  return null;
}

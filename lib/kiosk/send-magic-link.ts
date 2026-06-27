import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPeerRacingMagicLink } from "@/lib/auth/send-magic-link-email";

/**
 * Sends a Peer Racing magic-link email via Resend (not Supabase SMTP).
 */
export async function sendPeerRacingMagicLinkEmail(args: {
  email: string;
  redirectTo: string;
  origin: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let returnUrl = "/";
  try {
    const url = new URL(args.redirectTo);
    const fromQuery = url.searchParams.get("returnUrl");
    if (fromQuery?.startsWith("/") && !fromQuery.startsWith("//")) {
      returnUrl = fromQuery;
    }
  } catch {
    /* use default returnUrl */
  }

  return sendPeerRacingMagicLink({
    email: args.email,
    origin: args.origin,
    returnUrl,
  });
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

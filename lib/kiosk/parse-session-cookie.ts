import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashSessionToken } from "@/lib/kiosk/session-token";

const COOKIE = "pr_kiosk";

export function kioskCookieName() {
  return COOKIE;
}

export type KioskTerminalRow = {
  id: string;
  event_id: string;
  terminal_index: number;
  generation_version: number;
  bound_local_date: string;
  signed_off_at: string | null;
  last_heartbeat_at: string;
};

/**
 * Validates pr_kiosk cookie against DB; does not mutate event_kiosk (no daily roll here).
 */
export async function getKioskSessionFromCookies(
  admin: SupabaseClient,
  cookieHeader: string | null,
): Promise<{ terminal: KioskTerminalRow } | null> {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((c) => c.trim());
  const raw = parts.find((p) => p.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const value = decodeURIComponent(raw.slice(COOKIE.length + 1));
  const sep = value.indexOf(":");
  if (sep < 1) return null;
  const terminalId = value.slice(0, sep);
  const token = value.slice(sep + 1);
  if (!terminalId || !token) return null;

  const digest = hashSessionToken(token);
  const { data: row } = await admin
    .from("event_kiosk_terminal")
    .select("id,event_id,terminal_index,generation_version,bound_local_date,session_token_digest,signed_off_at,last_heartbeat_at")
    .eq("id", terminalId)
    .maybeSingle();

  if (!row) return null;
  const t = row as KioskTerminalRow & { session_token_digest: string };
  if (t.signed_off_at) return null;
  if (t.session_token_digest !== digest) return null;

  const { data: kiosk } = await admin
    .from("event_kiosk")
    .select("generation_version,codes_for_local_date")
    .eq("event_id", t.event_id)
    .maybeSingle();

  if (!kiosk) return null;
  const k = kiosk as { generation_version: number; codes_for_local_date: string };
  if (k.generation_version !== t.generation_version || k.codes_for_local_date !== t.bound_local_date) {
    return null;
  }

  return { terminal: t };
}

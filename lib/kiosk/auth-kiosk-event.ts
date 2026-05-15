import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceOrThrow } from "@/lib/kiosk/ensure-kiosk-row";
import { getKioskSessionFromCookies, type KioskTerminalRow } from "@/lib/kiosk/parse-session-cookie";

/**
 * Validates pr_kiosk cookie and ensures the terminal is bound to `eventId`.
 */
export async function authKioskForEvent(
  request: Request,
  eventId: string,
): Promise<
  { ok: true; admin: SupabaseClient; terminal: KioskTerminalRow } | { ok: false; response: NextResponse }
> {
  let admin;
  try {
    admin = getServiceOrThrow();
  } catch (e) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 }),
    };
  }

  const session = await getKioskSessionFromCookies(admin, request.headers.get("cookie"));
  if (!session || session.terminal.event_id !== eventId) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, admin, terminal: session.terminal };
}

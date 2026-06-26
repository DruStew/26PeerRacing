import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { authKioskForEvent } from "@/lib/kiosk/auth-kiosk-event";
import { getServiceOrThrow } from "@/lib/kiosk/ensure-kiosk-row";
import type { KioskTerminalRow } from "@/lib/kiosk/parse-session-cookie";
import { loadEventForPromoterTools } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type KioskOrPromoterAuth =
  | { ok: true; admin: SupabaseClient; source: "kiosk"; terminal: KioskTerminalRow }
  | { ok: true; admin: SupabaseClient; source: "promoter" }
  | { ok: false; response: NextResponse };

/**
 * Race-day check-in APIs: kiosk terminal session OR event promoter / platform admin.
 */
export async function authKioskOrPromoterForEvent(
  request: Request,
  eventId: string,
): Promise<KioskOrPromoterAuth> {
  const kiosk = await authKioskForEvent(request, eventId);
  if (kiosk.ok) {
    return { ok: true, admin: kiosk.admin, source: "kiosk", terminal: kiosk.terminal };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const loaded = await loadEventForPromoterTools(supabase, user.id, eventId, "id,promoter_id");
  if (!loaded.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: loaded.reason === "not_found" ? "Event not found" : "Forbidden" },
        { status: loaded.reason === "not_found" ? 404 : 403 },
      ),
    };
  }

  let admin: SupabaseClient;
  try {
    admin = getServiceOrThrow();
  } catch (e) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 }),
    };
  }

  return { ok: true, admin, source: "promoter" };
}

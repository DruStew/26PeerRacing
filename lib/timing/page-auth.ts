import "server-only";

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceOrThrow } from "@/lib/kiosk/ensure-kiosk-row";
import { getKioskSessionFromCookies, kioskCookieName } from "@/lib/kiosk/parse-session-cookie";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Page-level gate for race-day timing pages (Finish Cam, Race Control):
 * a kiosk terminal session for this event OR the promoter / platform admin.
 * On failure, callers should redirect to `redirectTo` (the kiosk code entry
 * page, which sends the device back here after the 6-digit code).
 */
export async function gateTimingPage(
  eventId: string,
  returnPath: string,
): Promise<
  | { ok: true; source: "kiosk" | "promoter"; service: SupabaseClient }
  | { ok: false; redirectTo: string }
> {
  const kioskLogin = `/kiosk/${eventId}?next=${encodeURIComponent(returnPath)}`;

  let service: SupabaseClient;
  try {
    service = getServiceOrThrow();
  } catch {
    return { ok: false, redirectTo: kioskLogin };
  }

  // 1. Kiosk terminal cookie.
  const cookieStore = await cookies();
  const raw = cookieStore.get(kioskCookieName())?.value;
  if (raw) {
    const cookieHeader = `${kioskCookieName()}=${encodeURIComponent(raw)}`;
    const session = await getKioskSessionFromCookies(service, cookieHeader);
    if (session && session.terminal.event_id === eventId) {
      return { ok: true, source: "kiosk", service };
    }
  }

  // 2. Promoter / admin login.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: event } = await supabase
      .from("events")
      .select("id,promoter_id")
      .eq("id", eventId)
      .maybeSingle();
    if (event && (await canManageEvent(supabase, user.id, (event as { promoter_id: string | null }).promoter_id))) {
      return { ok: true, source: "promoter", service };
    }
  }

  return { ok: false, redirectTo: kioskLogin };
}

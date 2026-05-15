import { NextResponse } from "next/server";

import { deriveKioskCode } from "@/lib/kiosk/derive-codes";
import { ensureKioskRowForEvent, getServiceOrThrow } from "@/lib/kiosk/ensure-kiosk-row";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function assertPromoter(eventId: string, userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: event } = await supabase.from("events").select("promoter_id").eq("id", eventId).maybeSingle();
  const promoterId = (event as { promoter_id?: string } | null)?.promoter_id;
  if (promoterId === userId) return true;
  const { data: adminRole } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(adminRole);
}

/** GET: today's derived codes + terminal list (promoter only). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!(await assertPromoter(eventId, user.id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let admin;
  try {
    admin = getServiceOrThrow();
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }

  const { data: ev } = await admin.from("events").select("timezone,name").eq("id", eventId).single();
  const tz = (ev as { timezone?: string })?.timezone ?? "America/Chicago";

  let kioskRow;
  try {
    kioskRow = await ensureKioskRowForEvent(admin, eventId, tz);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  let kioskCode: string;
  let authCode: string;
  try {
    kioskCode = deriveKioskCode(
      eventId,
      kioskRow.codes_for_local_date,
      kioskRow.generation_version,
      "kiosk",
    );
    authCode = deriveKioskCode(
      eventId,
      kioskRow.codes_for_local_date,
      kioskRow.generation_version,
      "auth",
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }

  const { data: terminals } = await admin
    .from("event_kiosk_terminal")
    .select("id,terminal_index,signed_off_at,last_heartbeat_at,created_at")
    .eq("event_id", eventId)
    .order("terminal_index", { ascending: true });

  const now = Date.now();
  const list = (terminals ?? []).map((t) => {
    const row = t as {
      id: string;
      terminal_index: number;
      signed_off_at: string | null;
      last_heartbeat_at: string;
    };
    let status: "green" | "yellow" | "red";
    if (row.signed_off_at) {
      status = "red";
    } else {
      const last = new Date(row.last_heartbeat_at).getTime();
      if (now - last > 5 * 60 * 1000) status = "yellow";
      else status = "green";
    }
    return {
      id: row.id,
      label: `T${row.terminal_index}`,
      status,
      signedOff: Boolean(row.signed_off_at),
      lastHeartbeatAt: row.last_heartbeat_at,
    };
  });

  return NextResponse.json({
    ok: true,
    eventName: (ev as { name?: string })?.name ?? "",
    timezone: tz,
    codesForLocalDate: kioskRow.codes_for_local_date,
    generationVersion: kioskRow.generation_version,
    kioskCode,
    authCode,
    terminals: list,
  });
}

/** POST: regenerate codes (invalidates all terminals). */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!(await assertPromoter(eventId, user.id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let admin;
  try {
    admin = getServiceOrThrow();
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }

  const { data: ev } = await admin.from("events").select("timezone").eq("id", eventId).single();
  const tz = (ev as { timezone?: string })?.timezone ?? "America/Chicago";

  try {
    await ensureKioskRowForEvent(admin, eventId, tz, { forceRegenerate: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

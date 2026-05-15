import { NextResponse } from "next/server";

import { deriveKioskCode, timingSafeEqualString } from "@/lib/kiosk/derive-codes";
import { ensureKioskRowForEvent, getServiceOrThrow } from "@/lib/kiosk/ensure-kiosk-row";
import { kioskCookieName } from "@/lib/kiosk/parse-session-cookie";
import { hashSessionToken, newSessionToken } from "@/lib/kiosk/session-token";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { eventId?: string; kioskCode?: string };
  try {
    body = (await request.json()) as { eventId?: string; kioskCode?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const rawCode = typeof body.kioskCode === "string" ? body.kioskCode.replace(/\D/g, "") : "";
  if (!eventId || rawCode.length !== 6) {
    return NextResponse.json({ ok: false, error: "Enter the 6-digit kiosk code." }, { status: 400 });
  }

  let admin;
  try {
    admin = getServiceOrThrow();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 503 },
    );
  }

  const { data: ev, error: evErr } = await admin
    .from("events")
    .select("id,timezone,status")
    .eq("id", eventId)
    .maybeSingle();

  if (evErr || !ev) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  const status = (ev as { status?: string }).status;
  if (status !== "published") {
    return NextResponse.json({ ok: false, error: "Event is not available for kiosk." }, { status: 403 });
  }

  const tz = (ev as { timezone?: string | null }).timezone ?? "America/Chicago";

  let kioskRow;
  try {
    kioskRow = await ensureKioskRowForEvent(admin, eventId, tz);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  const expected = deriveKioskCode(
    eventId,
    kioskRow.codes_for_local_date,
    kioskRow.generation_version,
    "kiosk",
  );
  if (!timingSafeEqualString(rawCode, expected)) {
    return NextResponse.json({ ok: false, error: "Invalid code." }, { status: 401 });
  }

  const { data: maxRow } = await admin
    .from("event_kiosk_terminal")
    .select("terminal_index")
    .eq("event_id", eventId)
    .order("terminal_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIndex = ((maxRow as { terminal_index?: number } | null)?.terminal_index ?? 0) + 1;
  const token = newSessionToken();
  const digest = hashSessionToken(token);

  const { data: term, error: insErr } = await admin
    .from("event_kiosk_terminal")
    .insert({
      event_id: eventId,
      terminal_index: nextIndex,
      generation_version: kioskRow.generation_version,
      bound_local_date: kioskRow.codes_for_local_date,
      session_token_digest: digest,
      last_heartbeat_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insErr || !term) {
    return NextResponse.json({ ok: false, error: insErr?.message ?? "Could not start terminal" }, { status: 500 });
  }

  const terminalId = (term as { id: string }).id;
  const cookieVal = `${terminalId}:${token}`;
  const res = NextResponse.json({
    ok: true,
    redirect: `/events/${eventId}/check-in`,
    terminalLabel: `T${nextIndex}`,
  });
  res.cookies.set(kioskCookieName(), cookieVal, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

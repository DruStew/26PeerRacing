import { NextResponse } from "next/server";

import { authKioskOrPromoterForEvent } from "@/lib/kiosk/auth-kiosk-or-promoter-event";

export const dynamic = "force-dynamic";

const MAX_ENTRIES = 5000;

/**
 * Bulk check-in from the promoter roster: confirms many entries at once.
 * Carry-Over linked entries are synced by the RPC, and already-checked-in
 * entries are skipped, so re-sending ids is harmless.
 */
export async function POST(request: Request) {
  let body: { eventId?: string; entryIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const entryIds = Array.isArray(body.entryIds)
    ? [...new Set(body.entryIds.filter((v): v is string => typeof v === "string" && v.length > 0))]
    : [];

  if (!eventId || entryIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing eventId or entryIds" }, { status: 400 });
  }
  if (entryIds.length > MAX_ENTRIES) {
    return NextResponse.json(
      { ok: false, error: `Too many entries (max ${MAX_ENTRIES})` },
      { status: 400 },
    );
  }

  const auth = await authKioskOrPromoterForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  const { data: updatedCount, error } = await auth.admin.rpc("kiosk_bulk_confirm_check_in", {
    p_event_id: eventId,
    p_entry_ids: entryIds,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: (updatedCount as number | null) ?? 0 });
}

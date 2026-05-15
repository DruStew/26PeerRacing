import { NextResponse } from "next/server";

import { authKioskForEvent } from "@/lib/kiosk/auth-kiosk-event";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  let body: {
    eventId?: string;
    entryId?: string;
    transponder1?: string | null;
    transponder2?: string | null;
    /** Host timing bib for this race only (see entries.assigned_bib). */
    assignedBib?: string | null;
    /** Volunteer double-check: marks runner ready for this distance. */
    confirmCheckIn?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";
  if (!eventId || !entryId) {
    return NextResponse.json({ ok: false, error: "Missing eventId or entryId" }, { status: 400 });
  }

  const auth = await authKioskForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  const t1 =
    body.transponder1 === undefined
      ? undefined
      : body.transponder1 === null
        ? null
        : String(body.transponder1).trim() || null;
  const t2 =
    body.transponder2 === undefined
      ? undefined
      : body.transponder2 === null
        ? null
        : String(body.transponder2).trim() || null;

  let assignedBib: string | null | undefined;
  if (body.assignedBib !== undefined) {
    assignedBib = body.assignedBib === null ? null : String(body.assignedBib).trim() || null;
  }

  const patch: Record<string, string | null | undefined> = {};
  if (t1 !== undefined) patch.transponder_1 = t1;
  if (t2 !== undefined) patch.transponder_2 = t2;
  if (assignedBib !== undefined) patch.assigned_bib = assignedBib;
  const confirmCheckIn = body.confirmCheckIn === true;
  const hasFieldPatch = Object.keys(patch).length > 0;

  if (!confirmCheckIn && !hasFieldPatch) {
    return NextResponse.json(
      {
        ok: false,
        error: "Nothing to update (transponders, assigned race bib, or confirm check-in)",
      },
      { status: 400 },
    );
  }

  // Confirm check-in updates kiosk_checked_in_at via Postgres RPC so we are not blocked by PostgREST’s
  // *entries* schema cache (common right after adding a column, before reload). The UPDATE runs in the DB.
  let data: Record<string, unknown> | null = null;

  if (confirmCheckIn) {
    const { data: rpcRows, error: rpcError } = await auth.admin.rpc("kiosk_confirm_entry_check_in", {
      p_event_id: eventId,
      p_entry_id: entryId,
    });
    if (rpcError) {
      return NextResponse.json({ ok: false, error: rpcError.message }, { status: 500 });
    }
    const rows = rpcRows as unknown[] | undefined;
    data = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | null;
    if (!data) {
      return NextResponse.json({ ok: false, error: "Entry not found for this event" }, { status: 404 });
    }
  }

  if (hasFieldPatch) {
    const { data: updData, error } = await auth.admin
      .from("entries")
      .update(patch)
      .eq("id", entryId)
      .eq("event_id", eventId)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!updData) {
      return NextResponse.json({ ok: false, error: "Entry not found for this event" }, { status: 404 });
    }
    data = updData as Record<string, unknown>;
  }

  return NextResponse.json({ ok: true, entry: data });
}

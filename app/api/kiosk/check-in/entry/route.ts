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

  // Duplicate guard: a race-day bib or transponder may only belong to ONE runner per event
  // (the same runner may share it across their own entries, e.g. 10K + 5K roll-over).
  if (assignedBib || t1 || t2) {
    const { data: targetEntry } = await auth.admin
      .from("entries")
      .select("id,user_id,email")
      .eq("id", entryId)
      .eq("event_id", eventId)
      .maybeSingle();
    const target = targetEntry as { id: string; user_id: string | null; email: string | null } | null;
    if (!target) {
      return NextResponse.json({ ok: false, error: "Entry not found for this event" }, { status: 404 });
    }

    const { data: eventEntriesRaw } = await auth.admin
      .from("entries")
      .select("id,user_id,email,first_name,last_name,assigned_bib,transponder_1,transponder_2")
      .eq("event_id", eventId);
    type EvEntry = {
      id: string;
      user_id: string | null;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      assigned_bib: string | null;
      transponder_1: string | null;
      transponder_2: string | null;
    };
    const eventEntries = (eventEntriesRaw ?? []) as EvEntry[];

    const targetEmail = target.email?.trim().toLowerCase() ?? "";
    const sameRunner = (e: EvEntry) => {
      if (target.user_id && e.user_id === target.user_id) return true;
      if (!target.user_id && !e.user_id && targetEmail && e.email?.trim().toLowerCase() === targetEmail) return true;
      return e.id === target.id;
    };

    const norm = (v: string | null | undefined) => v?.trim().toLowerCase() ?? "";

    const runnerName = async (e: EvEntry): Promise<string> => {
      if (e.user_id) {
        const { data: prof } = await auth.admin
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", e.user_id)
          .maybeSingle();
        const p = prof as { first_name?: string | null; last_name?: string | null } | null;
        const n = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
        if (n) return n;
      }
      const n = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
      return n || "another runner";
    };

    if (assignedBib) {
      const bibNorm = norm(assignedBib);
      const clash = eventEntries.find((e) => !sameRunner(e) && norm(e.assigned_bib) === bibNorm);
      if (clash) {
        return NextResponse.json(
          {
            ok: false,
            error: `Sorry — bib #${assignedBib} for this event is already assigned to ${await runnerName(clash)}.`,
            conflictField: "assignedBib",
          },
          { status: 409 },
        );
      }

      // A race-day bib must also never collide with another entrant's lifetime PR ID.
      const otherUserIds = [...new Set(eventEntries.filter((e) => !sameRunner(e) && e.user_id).map((e) => e.user_id))];
      if (otherUserIds.length > 0) {
        const { data: prClashRaw } = await auth.admin
          .from("profiles")
          .select("first_name,last_name,pr_id")
          .in("id", otherUserIds as string[])
          .eq("pr_id", assignedBib.trim())
          .limit(1);
        const prClash = (prClashRaw ?? [])[0] as
          | { first_name?: string | null; last_name?: string | null; pr_id?: string | null }
          | undefined;
        if (prClash) {
          const n = `${prClash.first_name ?? ""} ${prClash.last_name ?? ""}`.trim() || "another runner";
          return NextResponse.json(
            {
              ok: false,
              error: `Sorry — #${assignedBib} is ${n}'s lifetime PR ID and can't be used as a race-day bib at this event.`,
              conflictField: "assignedBib",
            },
            { status: 409 },
          );
        }
      }
    }

    for (const [label, value] of [
      ["transponder 1", t1],
      ["transponder 2", t2],
    ] as const) {
      if (!value) continue;
      const vNorm = norm(value);
      const clash = eventEntries.find(
        (e) => !sameRunner(e) && (norm(e.transponder_1) === vNorm || norm(e.transponder_2) === vNorm),
      );
      if (clash) {
        return NextResponse.json(
          {
            ok: false,
            error: `Sorry — ${label} "${value}" for this event is already assigned to ${await runnerName(clash)}.`,
            conflictField: label === "transponder 1" ? "transponder1" : "transponder2",
          },
          { status: 409 },
        );
      }
    }
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

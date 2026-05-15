import { NextResponse } from "next/server";

import { authKioskForEvent } from "@/lib/kiosk/auth-kiosk-event";
import { countEntriesForKioskRow } from "@/lib/kiosk/match-profile-entries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { eventId?: string; q?: string };
  try {
    body = (await request.json()) as { eventId?: string; q?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (!eventId) {
    return NextResponse.json({ ok: false, error: "Missing eventId" }, { status: 400 });
  }

  const auth = await authKioskForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  if (q.length < 2) {
    return NextResponse.json({ ok: true, results: [] as const });
  }

  const { data, error } = await auth.admin.rpc("search_entries_for_kiosk", {
    p_event_id: eventId,
    p_q: q,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const raw = (data ?? []) as Record<string, unknown>[];

  const [{ data: eventEntries }, { data: distRows }] = await Promise.all([
    auth.admin.from("entries").select("user_id,email,distance_id").eq("event_id", eventId),
    auth.admin.from("distances").select("id,label").eq("event_id", eventId),
  ]);

  const distById = new Map(
    (distRows ?? []).map((d) => {
      const r = d as { id: string; label: string | null };
      return [r.id, r.label ?? ""] as const;
    }),
  );

  const results = raw.map((row) => {
    const ec = row.entry_count;
    const rpcN = typeof ec === "string" ? parseInt(ec, 10) : Number(ec);
    const { count, distanceIds } = countEntriesForKioskRow(eventEntries ?? [], {
      user_id: row.user_id as string | null | undefined,
      email: row.email as string | null | undefined,
    });
    const entry_count =
      count > 0 ? count : Number.isFinite(rpcN) && rpcN >= 0 ? rpcN : 0;

    const labels = [...distanceIds]
      .map((id) => distById.get(id))
      .filter((x): x is string => Boolean(x && String(x).trim() !== ""));
    const distance_summary =
      labels.length > 0 ? labels.join(" · ") : ((row.distance_summary as string | null) ?? null);

    return {
      ...row,
      entry_count,
      distance_summary,
    };
  });

  return NextResponse.json({ ok: true, results });
}

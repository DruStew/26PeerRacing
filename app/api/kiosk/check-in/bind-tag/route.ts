import { NextResponse } from "next/server";

import { authKioskOrPromoterForEvent } from "@/lib/kiosk/auth-kiosk-or-promoter-event";
import { TAG_CAPACITY, TAG_FAMILY } from "@/lib/timing/tags";

export const dynamic = "force-dynamic";

/**
 * POST { event_id, entry_id, tag_id } — bind a timing sticker to an entrant
 * at check-in. Rebinding is explicit: a tag already on another runner (or a
 * runner who already has a tag) gets replaced, and we report what changed.
 */
export async function POST(request: Request) {
  let body: { event_id?: string; entry_id?: string; tag_id?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = String(body.event_id ?? "").trim();
  const entryId = String(body.entry_id ?? "").trim();
  const tagId = Number(body.tag_id);
  if (!eventId || !entryId || !Number.isInteger(tagId) || tagId < 0 || tagId >= TAG_CAPACITY) {
    return NextResponse.json(
      { ok: false, error: "Provide event_id, entry_id and a valid tag_id." },
      { status: 400 },
    );
  }

  const auth = await authKioskOrPromoterForEvent(request, eventId);
  if (!auth.ok) return auth.response;
  const admin = auth.admin;

  const { data: entry } = await admin
    .from("entries")
    .select("id,first_name,last_name,assigned_bib,bib")
    .eq("id", entryId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Entry not found." }, { status: 404 });
  }

  // Was this tag on someone else? (informational, for the confirmation toast)
  const { data: prevTag } = await admin
    .from("timing_tags")
    .select("entry_id,entries(first_name,last_name)")
    .eq("event_id", eventId)
    .eq("tag_id", tagId)
    .maybeSingle();

  // Clear both sides of the binding, then insert fresh.
  await admin.from("timing_tags").delete().eq("event_id", eventId).eq("tag_id", tagId);
  await admin.from("timing_tags").delete().eq("event_id", eventId).eq("entry_id", entryId);

  const { error } = await admin.from("timing_tags").insert({
    event_id: eventId,
    tag_id: tagId,
    entry_id: entryId,
    tag_family: TAG_FAMILY,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const e = entry as {
    first_name: string | null;
    last_name: string | null;
    assigned_bib: string | null;
    bib: string | null;
  };
  const prev = prevTag as unknown as {
    entry_id: string;
    entries: { first_name: string | null; last_name: string | null } | null;
  } | null;
  const reboundFrom =
    prev && prev.entry_id !== entryId && prev.entries
      ? [prev.entries.first_name, prev.entries.last_name].filter(Boolean).join(" ")
      : null;

  return NextResponse.json({
    ok: true,
    runner: [e.first_name, e.last_name].filter(Boolean).join(" "),
    bib: e.assigned_bib || e.bib || null,
    tag_id: tagId,
    rebound_from: reboundFrom,
  });
}

/** DELETE ?event_id=&entry_id= — remove a runner's tag binding. */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("event_id")?.trim() ?? "";
  const entryId = url.searchParams.get("entry_id")?.trim() ?? "";
  if (!eventId || !entryId) {
    return NextResponse.json({ ok: false, error: "Missing event_id or entry_id." }, { status: 400 });
  }

  const auth = await authKioskOrPromoterForEvent(request, eventId);
  if (!auth.ok) return auth.response;

  const { error } = await auth.admin
    .from("timing_tags")
    .delete()
    .eq("event_id", eventId)
    .eq("entry_id", entryId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

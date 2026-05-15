import { NextResponse } from "next/server";

import { authKioskForEvent } from "@/lib/kiosk/auth-kiosk-event";
import { filterEntriesForProfile } from "@/lib/kiosk/match-profile-entries";

export const dynamic = "force-dynamic";

type DistanceRow = {
  id: string;
  label: string | null;
  entry_fee_cents: number | null;
  is_peer_racing_qualifier?: boolean | null;
  allow_roll_over_from_qualifier?: boolean | null;
  allow_qualifier_split_to_roll_over_here?: boolean | null;
};

/**
 * Full runner context for check-in: profile, all entries for this event, upsell distances, carry-over options.
 */
export async function POST(request: Request) {
  let body: { eventId?: string; userId?: string; entryId?: string };
  try {
    body = (await request.json()) as { eventId?: string; userId?: string; entryId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  let userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";

  const auth = await authKioskForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  // Tapped row: resolve runner from the entry id first so we never trust a stale/wrong user_id from search alone.
  if (entryId) {
    const { data: ent } = await auth.admin
      .from("entries")
      .select("user_id,email")
      .eq("id", entryId)
      .eq("event_id", eventId)
      .maybeSingle();
    const row = ent as { user_id?: string | null; email?: string | null } | null;
    if (row?.user_id) {
      userId = row.user_id;
    } else if (row?.email?.trim()) {
      const lookupEmail = row.email.trim();
      const { data: profExact } = await auth.admin.from("profiles").select("id").eq("email", lookupEmail).limit(2);
      if (profExact?.length === 1) {
        userId = (profExact[0] as { id: string }).id;
      } else {
        const { data: profI } = await auth.admin.from("profiles").select("id").ilike("email", lookupEmail).limit(2);
        if (profI?.length === 1) userId = (profI[0] as { id: string }).id;
      }
    }
  }

  if (!eventId || !userId) {
    return NextResponse.json(
      { ok: false, error: "Missing eventId or userId (send a search row entry id if user_id is unavailable)." },
      { status: 400 },
    );
  }

  const { data: profile } = await auth.admin
    .from("profiles")
    .select("id,first_name,last_name,email,phone,pr_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  // Do not list kiosk_checked_in_at (or other new columns) unless the migration is applied — PostgREST fails the
  // whole select if any named column is missing, which yields empty entries and breaks the whole check-in UI.
  const { data: allEventEntries, error: entriesFetchError } = await auth.admin
    .from("entries")
    .select("*")
    .eq("event_id", eventId);

  if (entriesFetchError) {
    return NextResponse.json({ ok: false, error: entriesFetchError.message }, { status: 500 });
  }

  const entriesRaw = filterEntriesForProfile(allEventEntries ?? [], {
    id: userId,
    email: (profile as { email?: string | null }).email,
  }).sort(
    (a, b) =>
      new Date(String((a as { created_at?: string }).created_at ?? 0)).getTime() -
      new Date(String((b as { created_at?: string }).created_at ?? 0)).getTime(),
  );

  const { data: distancesRaw } = await auth.admin
    .from("distances")
    .select(
      "id,label,entry_fee_cents,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here",
    )
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  const distances = (distancesRaw ?? []) as DistanceRow[];
  const distById = new Map(distances.map((d) => [d.id, d]));

  const entries = (entriesRaw ?? []).map((e) => {
    const row = e as {
      id: string;
      distance_id: string;
      entry_type: string;
      source_entry_id: string | null;
      entry_kind: string;
      paid_at: string | null;
      paid_amount_cents: number | null;
      transponder_1: string | null;
      transponder_2: string | null;
      bib: string | null;
      kiosk_checked_in_at?: string | null;
    };
    return {
      ...row,
      kiosk_checked_in_at: row.kiosk_checked_in_at ?? null,
      distance_label: distById.get(row.distance_id)?.label ?? "Race",
    };
  });

  const enteredDistanceIds = new Set(entries.map((e) => e.distance_id));

  const qualifier = distances.find((d) => d.is_peer_racing_qualifier && d.allow_roll_over_from_qualifier);
  const hasQualifierPrimary = Boolean(
    qualifier && entries.some((e) => e.distance_id === qualifier.id && e.entry_type === "primary"),
  );

  const rollOverOptions: { targetDistanceId: string; sourceDistanceId: string; label: string; entry_fee_cents: number }[] =
    [];
  if (hasQualifierPrimary && qualifier) {
    for (const d of distances) {
      if (!d.allow_qualifier_split_to_roll_over_here) continue;
      if (enteredDistanceIds.has(d.id)) continue;
      rollOverOptions.push({
        targetDistanceId: d.id,
        sourceDistanceId: qualifier.id,
        label: `${d.label ?? "Race"} (carry-over from qualifier)`,
        entry_fee_cents: typeof d.entry_fee_cents === "number" ? d.entry_fee_cents : 0,
      });
    }
  }

  const rollTargetIds = new Set(rollOverOptions.map((r) => r.targetDistanceId));
  const upsellDistances = distances
    .filter((d) => !enteredDistanceIds.has(d.id) && !rollTargetIds.has(d.id))
    .map((d) => ({
      id: d.id,
      label: d.label ?? "Race",
      entry_fee_cents: typeof d.entry_fee_cents === "number" ? d.entry_fee_cents : 0,
    }));

  return NextResponse.json({
    ok: true,
    profile: {
      id: (profile as { id: string }).id,
      first_name: (profile as { first_name?: string | null }).first_name ?? "",
      last_name: (profile as { last_name?: string | null }).last_name ?? "",
      email: (profile as { email?: string | null }).email ?? "",
      phone: (profile as { phone?: string | null }).phone ?? "",
      pr_id: (profile as { pr_id?: string | null }).pr_id ?? null,
    },
    entries,
    upsellDistances,
    rollOverOptions,
  });
}
